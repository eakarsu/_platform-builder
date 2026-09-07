from pathlib import Path
import json
B=Path(__file__).resolve().parent.parent
p=B/'reports/build-manifest.json';plans=json.loads(p.read_text());finance=next(x for x in plans if x['id']=='finance-risk-platform');sales=next(x for x in plans if x['id']=='sales-platform')
if 'financialServices_salesforce' in finance['sources']:finance['sources'].remove('financialServices_salesforce');sales['sources'].append('financialServices_salesforce')
for plan in plans:plan['sourceCount']=len(plan['sources'])
p.write_text(json.dumps(plans,indent=2)+'\n')
p=B/'reports/extracted-features.json';apps=json.loads(p.read_text());index={a['project']:a for a in apps}
reviews={
'AIElderCareCompanion':('backend/migrations/001_governed_care.sql',[
('care-enrollments','Care enrollments','client_reference guardian_reference consent emergency_contact_reference approved_summary',False),
('care-plans','Care plans','assessment interventions prepared_by approved_by',True),
('care-incidents','Care incidents','severity category observed_facts immediate_actions occurred_date reported_by',False),
('care-dispatch-requests','Care dispatch requests','incident_reference immediate_actions dispatch_notes',False,'integration')]),
'AIMusicGeneration':('server/migrations/001_governed_music_creation.sql',[
('music-projects','Music projects','project_version input_digest project_details',True),
('music-assets','Music assets & rights','asset_ref kind content_digest rights performer_consent storage_reference',False),
('music-review','Music rights & moderation review','project_reference approval_type decision attestation_digest review_notes',False),
('music-render-requests','Music render requests','project_reference manifest request_digest requested_stems',False,'integration'),
('music-publication-requests','Music publication requests','project_reference channel export_digest watermark_digest disclosure',False,'integration')]),
'financialServices_salesforce':('migrations/001_governed_sales.sql',[
('leads','Leads & opportunities','email full_name company consent_details suppression_details owner lifecycle_stage',True),
('outreach-review','Outreach review records','lead_reference channel proposed_content consent_details reviewer review_notes',False),
('outreach-delivery-requests','Outreach delivery requests','lead_reference channel provider_reference content',False,'integration')]),
'referral':('server/migrations/001_governed_referral.sql',[
('leads','Leads & opportunities','email full_name company consent_details suppression_details owner lifecycle_stage',True),
('ownership-reviews','Lead ownership reviews','lead_reference current_owner requested_owner manager_decision acceptance_details',False),
('outreach-review','Outreach review records','lead_reference channel proposed_content consent_details reviewer review_notes',False),
('outreach-delivery-requests','Outreach delivery requests','lead_reference channel provider_reference content',False,'integration')]),
'software-for-agents':('backend/db/migrations/001_tenant_agent_workflow.sql',[
('agent-knowledge','Agent knowledge documents','source_reference document_version content source_url allowed_scope',True),
('agent-questions','Agent questions & citations','question source_references answer_text citation_text',True),
('agent-evaluations','Agent evaluation records','question expected_source_ids required_terms minimum_score score_details',False),
('agent-tool-requests','Agent tool execution requests','connector_reference action input_payload approval_note',False,'integration')]),
'integrator':('backend/migrations/001_initial.sql',[
('connections','Provider connections','connector_type base_url purpose',False,'integration'),
('integration-workflows','Integration workflow plans','definition max_attempts retry_delay_ms description',False),
('integration-run-requests','Integration run requests','workflow_reference input_payload retry_notes',False,'integration')])}
for source,(file,rows) in reviews.items():
 app=index[source];app['definitions']=[d for d in app['definitions'] if d.get('definition')!='reviewed-supported-workflow']
 for row in rows:
  key,title,fields,ai,*mode=row
  app['definitions'].append(dict(key=key,title=title,fields=fields.split(),ai=ai,source=source+'/'+file,definition='reviewed-supported-workflow',mode=mode[0] if mode else 'records',description='Record '+title.lower()+' evidence and prepare human review.'))
p.write_text(json.dumps(apps,indent=2)+'\n')
(B/'reports/reviewed-workflow-additions.json').write_text(json.dumps({'classificationCorrection':'financialServices_salesforce moved to Sales: current supported source is consented lead-to-conversion operations.','sources':list(reviews),'boundary':'Native records and request preparation added. Source tenant/role state machines, provider workers and independent-review enforcement are not claimed migrated.'},indent=2)+'\n')
