'use strict';

// Shared server-side transport. Domain prompts and authorization stay in each app.
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
class AIRequestError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'AIRequestError';
    this.code = code;
    this.status = status;
  }
}

async function openRouterFetch(options = {}, transport = globalThis.fetch) {
  const headers = new Headers(options.headers);
  const authorization = headers.get('authorization');
  if (!authorization || /^Bearer\s*(undefined|null)?\s*$/i.test(authorization)) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      throw new AIRequestError('Configure OPENROUTER_API_KEY to use AI features.', 'AI_NOT_CONFIGURED');
    }
    headers.set('authorization', `Bearer ${process.env.OPENROUTER_API_KEY}`);
  }
  let body;
  try { body = JSON.parse(options.body); }
  catch { throw new AIRequestError('AI request must contain a JSON body.', 'AI_INVALID_REQUEST'); }
  if (!Array.isArray(body.messages) || !body.messages.length || body.stream) {
    throw new AIRequestError('Provide messages for a non-streaming AI request.', 'AI_INVALID_REQUEST');
  }
  if (!body.model) body.model = process.env.OPENROUTER_MODEL;
  if (!body.model) throw new AIRequestError('Configure OPENROUTER_MODEL.', 'AI_NOT_CONFIGURED');
  headers.set('content-type', 'application/json');
  if (!headers.has('x-title')) headers.set('x-title', 'Legal Platform');
  const timeoutMs = Number(options.timeoutMs ?? process.env.AI_TIMEOUT_MS ?? 45000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
    throw new AIRequestError('AI_TIMEOUT_MS must be between 1 and 300000.', 'AI_INVALID_CONFIG');
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await transport(ENDPOINT, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
    });
    // Read under the same timeout. Do not expose provider bodies, prompts or keys in errors.
    const text = await response.text();
    if (!response.ok) throw new AIRequestError(`AI provider returned HTTP ${response.status}.`, 'AI_PROVIDER_ERROR', response.status);
    let data;
    try { data = JSON.parse(text); }
    catch { throw new AIRequestError('AI provider returned invalid JSON.', 'AI_INVALID_RESPONSE'); }
    if (data.error) throw new AIRequestError('AI provider rejected the request.', 'AI_PROVIDER_ERROR', response.status);
    if (!Array.isArray(data.choices) || !data.choices.length) {
      throw new AIRequestError('AI provider returned no completion.', 'AI_INVALID_RESPONSE');
    }
    return new Response(text, { status: response.status, headers: { 'content-type': 'application/json' } });
  } catch (error) {
    if (controller.signal.aborted) throw new AIRequestError('AI request timed out or was cancelled.', 'AI_ABORTED');
    if (error instanceof AIRequestError) throw error;
    throw new AIRequestError('Unable to reach the AI provider.', 'AI_NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

// Axios-shaped compatibility for the document suite; unrelated HTTP calls keep Axios.
async function openRouterPost(body, config = {}) {
  const response = await openRouterFetch({
    body: JSON.stringify(body), headers: config.headers,
    signal: config.signal, timeoutMs: config.timeout || undefined,
  });
  return { data: await response.json(), status: response.status };
}

async function createChatCompletion(body, options = {}) {
  const response = await openRouterFetch({ body: JSON.stringify(body), timeoutMs: options.timeoutMs, signal: options.signal });
  return response.json();
}

module.exports = { openRouterFetch, openRouterPost, createChatCompletion, AIRequestError };
