import {normalizeCustomer} from './normalizeCustomer';
let cached:Promise<any>|null=null;
let learnerLink='';
const read=()=>cached||(cached=fetch('/api/care/customers/'+encodeURIComponent(new URLSearchParams(location.search).get('customer')||'')+'/learner/preview').then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Không tải được phác đồ');return data;}).catch(e=>{cached=null;throw e;}));
const readonly=()=>{throw Error('Bản xem phác đồ chỉ cho phép xem nội dung.');};
export const loadPreview=async()=>{const data=await read();learnerLink=data.customer.link||'';return {...data,customer:normalizeCustomer(data.customer)};};
export const customerService=new Proxy({getCustomerById:async()=>(await loadPreview()).customer,getCustomerByToken:async()=>(await loadPreview()).customer,logVideoOpen:async()=>{}},{get:(target,key)=>target[key as keyof typeof target]||readonly});
export const customPlanService={getCustomPlan:async()=>[...(await read()).tasks]};
export const planService={getMasterPlan:async()=>[...(await read()).tasks]};
export const generateCustomerLink=()=>learnerLink;
export const campaignService={getCampaigns:async()=>[]};
export interface AdCampaign {id:string;name:string;media:string[];cta_name?:string;cta_link?:string;description?:string;display_now:boolean;display_days?:number;from_session?:number;to_session?:number;}
