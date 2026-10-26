import path from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const adapter=import.meta.dirname,root=path.resolve(adapter,'..');
export default defineConfig({root,base:'/plan-ui/',envDir:false,plugins:[{name:'shared-product-catalog',enforce:'pre',resolveId(source,importer){
 if(source.endsWith('/pages/ProductManagement')||source==='./pages/ProductManagement')return path.join(adapter,'ProductCatalog.tsx');
 if(source.endsWith('/services/productService'))return path.join(adapter,'productService.ts');
},transform(code,id){
 if(id.replaceAll('\\','/').endsWith('/pages/PlanEditor.tsx'))return code.replace("const defaultProd = availableProducts.find((p: any) => p.id_sp === 'SP1768731546380');","const defaultProd = availableProducts.find((p: any) => p.id_sp === 'SP1768731546380') || availableProducts.find((p: any) => p.productType === 'course');");
 if(!id.replaceAll('\\','/').endsWith('/App.tsx'))return;
 // Catalog fetches run independently of the heavier learner list. Never hydrate stale product caches.
 code=code.replace('setProducts(JSON.parse(cachedProd));','');
 // Render learners as soon as their query finishes, even if the catalog is slow.
 code=code.replace('const [cust, prod] = await Promise.all([customerService.getCustomers(), productService.getProducts()]);','const cust = await customerService.getCustomers();');
 code=code.replace('const validProd = Array.isArray(prod) ? prod : [];','');
 code=code.replace('setProducts(validProd);','');
 code=code.replace("localStorage.setItem('mega_products_cache', JSON.stringify(validProd));",'');
 code=code.replace('if (cachedCust && cachedProd)', 'if (cachedCust)');
 // The existing super_admin path does not use role mappings.
 code=code.replace('if (session) {', "if (session && adminRole !== 'super_admin') {");
 const anchor='  const handleUpsertCustomer =';
 if(!code.includes(anchor))throw Error('App catalog integration anchor changed.');
 return code.replace(anchor,`  useEffect(()=>{if(!session)return;let live=true;const load=()=>productService.getProducts().then(rows=>{if(live)setProducts(rows);}).catch(()=>{});load();window.addEventListener('focus',load);const timer=setInterval(load,30000);return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',load);};},[session,currentPage]);\n`+anchor);
}},react(),tailwindcss()],build:{outDir:path.resolve(root,'../../public/plan-ui'),emptyOutDir:false},define:{'process.env.API_KEY':'undefined','process.env.GEMINI_API_KEY':'undefined'}});
