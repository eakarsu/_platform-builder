// Group overlapping AI workflows by job to be done. Original IDs remain valid aliases.
const categories=[
 ['planning','Planning & scheduling',/schedul|appointment|booking|dispatch|route optim|waitlist|capacity|staff.match|staffing|workload|enrollment/i],
 ['finance','Finance & reconciliation',/invoice|reconcil|revenue|royalt|commission|payment|payroll|tax|cost|pricing|price|fee\b|refund|reimburse|settlement|credit|financial|budget|billing|chargeback/i],
 ['growth','Marketing & customer growth',/marketing|campaign|social.media|content.repurpos|seo\b|brand|reputation|review.response|sentiment|lead\b|upsell|cross.sell|reactivation|loyalty|churn|customer.insight|sales|outreach|conversion/i],
 ['documents','Writing, documents & knowledge',/document|draft|proposal|summari|transcri|translation|translate|notes\b|template|knowledge|research|citation|ocr\b|contract.review|redline|message|email|letter|report.generat/i],
 ['quality','Risk, quality & compliance',/risk|compliance|fraud|audit|anomal|validation|eligibility|policy|regulat|inspection|quality|safety|security|consent|verification|exception|control|evidence|accessib/i],
 ['insights','Insights & recommendations',/forecast|predict|recommend|analysis|analy[sz]|insight|classif|detect|scor|benchmark|trend|optimiz|matching/i],
 ['creative','Creative & design',/design|image|video|audio|music|creative|render|style|logo|visual|story|animation/i]
];
export function groupAssistants(features){
 const groups=new Map();for(const f of features.filter(f=>f.ai)){
  const category=categories.find(([, ,pattern])=>pattern.test(f.title))||['general','General assistance'];
  const [key,title]=category;if(!groups.has(key))groups.set(key,{id:'ai-'+key,title,group:'AI assistants',path:'/assistants/ai-'+key,featureIds:[],ai:true});groups.get(key).featureIds.push(f.id);
 }
 return [...groups.values()].map(g=>({...g,representativeId:g.featureIds[0],description:`One assistant for ${g.featureIds.length} related capabilities. Choose the work you need and combine your questions.`}));
}
