export const WORD_LIMIT=5000;
export const MAX_INPUT_CHARACTERS=100000;
export const MAX_OUTPUT_TOKENS=16000;
export const LONG_ANSWER_TIMEOUT_MS=180000;
export function countWords(value){return typeof value==='string'?(value.match(/\S+/gu)||[]).length:0;}
