import path from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const adapter=import.meta.dirname,root=path.resolve(adapter,'..');
export default defineConfig({root,base:'/plan-ui/',envDir:false,plugins:[{name:'shared-product-catalog',enforce:'pre',resolveId(source,importer){
 if(source.endsWith('/src/services/permissionService')||source.endsWith('/services/permissionService'))return path.join(adapter,'unifiedPermissionService.ts');
 if(source.endsWith('/pages/PermissionsManagement')||source.endsWith('/pages/AdminUsersManagement'))return path.join(adapter,'UnifiedAccounts.tsx');
 if(source.endsWith('/pages/ProductManagement')||source==='./pages/ProductManagement')return path.join(adapter,'ProductCatalog.tsx');
 if(source.endsWith('/services/productService'))return path.join(adapter,'productService.ts');
},transform(code,id){
 code=code.replace(/\r\n/g,'\n');
 if(id.replaceAll('\\','/').endsWith('/pages/PlanEditor.tsx'))return code.replace("const defaultProd = availableProducts.find((p: any) => p.id_sp === 'SP1768731546380');","const defaultProd = availableProducts.find((p: any) => p.id_sp === 'SP1768731546380') || availableProducts.find((p: any) => p.productType === 'course');");
 if(id.replaceAll('\\','/').endsWith('/pages/Dashboard.tsx')){
  const create=`          <button className="btn primary" onClick={() => onNavigate('plan-editor')}>
            <Plus size={14} /> Tạo PĐ
          </button>`;
  if(!code.includes(create))throw Error('Dashboard create permission anchor changed');
  return code.replace(create,"{hasPerm('add_student') && ("+create+")}").replace('onIconClick={handleAddStudent}',"onIconClick={hasPerm('add_student')?handleAddStudent:undefined}").replace('const handleAddStudent = () => {',"const handleAddStudent = () => { if(!hasPerm('add_student'))return;");
 }
 if(!id.replaceAll('\\','/').endsWith('/App.tsx'))return;
 // The host session is the only authority. Never make every embedded user super_admin.
 const authStart=code.indexOf('  // Auth Initialization - Bypassed for SSO Integration');
 const authEnd=code.indexOf('  const handleLogin',authStart);
 if(authStart<0||authEnd<0)throw Error('Unified auth anchor changed');
 code=code.slice(0,authStart)+`  useEffect(()=>{let live=true,previous='';const load=()=>fetch('/api/access/me',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Phiên đăng nhập không hợp lệ');return r.json();}).then(d=>{if(!live)return;const key=JSON.stringify([d.user.id,d.user.role,d.user.access]);if(key===previous)return;previous=key;setCustomers([]);setProducts([]);setSession({user:d.user});setIsAdmin(true);setAdminRole(d.user.role==='owner'?'super_admin':'user_'+d.user.id);setRolePermissions(d.catalog.filter(p=>p.id.startsWith('plan.')&&d.user.access[p.id]).map(p=>({role_name:d.user.role==='owner'?'super_admin':'user_'+d.user.id,permission_code:p.id.slice(5)})));setAuthLoading(false);}).catch(()=>{if(live){setSession(null);setIsAdmin(false);setAuthLoading(false);}});load();const timer=setInterval(load,15000);window.addEventListener('focus',load);return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',load);};},[]);\n`+code.slice(authEnd);
 // Remove the separate role fetch, including its permissive localStorage fallback.
 const permStart=code.indexOf('  // Load user role permissions mapping');
 const permEnd=code.indexOf('  const checkPermission',permStart);
 if(permStart<0||permEnd<0)throw Error('Unified permission anchor changed');
 code=code.slice(0,permStart)+code.slice(permEnd);
 code=code.replaceAll("permissions: 'super_admin_only'","permissions: 'manage_admins'").replaceAll("'admin-users': 'super_admin_only'","'admin-users': 'manage_admins'");
 // Never hydrate another account's persistent learner cache. Keep server-side cache authoritative.
 code=code.replace("const cachedCust = localStorage.getItem('mega_customers_cache');","const cachedCust = null;");
 code=code.replace(/localStorage\.setItem\('mega_customers_cache', JSON\.stringify\([^;]+;/g,'');
 // Catalog fetches run independently of the heavier learner list. Never hydrate stale product caches.
 code=code.replace('setProducts(JSON.parse(cachedProd));','');
 // Render learners as soon as their query finishes, even if the catalog is slow.
 code=code.replace('const [cust, prod] = await Promise.all([customerService.getCustomers(), productService.getProducts()]);','const cust = await customerService.getCustomers();');
 code=code.replace('const validProd = Array.isArray(prod) ? prod : [];','');
 code=code.replace('setProducts(validProd);','');
 code=code.replace("localStorage.setItem('mega_products_cache', JSON.stringify(validProd));",'');
 code=code.replace('if (cachedCust && cachedProd)', 'if (cachedCust)');

 const anchor='  const handleUpsertCustomer =';
 if(!code.includes(anchor))throw Error('App catalog integration anchor changed.');
 return code.replace(anchor,`  useEffect(()=>{if(!session)return;let live=true;const load=()=>productService.getProducts().then(rows=>{if(live)setProducts(rows);}).catch(()=>{});load();window.addEventListener('focus',load);const timer=setInterval(load,30000);return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',load);};},[session,currentPage]);\n`+anchor);
}},react(),tailwindcss()],build:{outDir:path.resolve(root,'../../public/plan-ui'),emptyOutDir:false},define:{'process.env.API_KEY':'undefined','process.env.GEMINI_API_KEY':'undefined'}});
