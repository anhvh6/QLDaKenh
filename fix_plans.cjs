const fs = require('fs');
const content = fs.readFileSync('public/plans.js', 'utf8');
const index = content.indexOf('return `<iframe class="plan-editor-frame" style="width:100%; height:calc(100vh -}planVersion');
if (index === -1) {
  console.log("Not found");
} else {
  const head = content.substring(0, index);
  const tailIndex = content.indexOf('export function initPlans');
  const tail = content.substring(tailIndex);
  const newMiddle = 'return `<iframe class="plan-editor-frame" style="width:100%; height:calc(100vh - 65px); border:none; display:block;" src="/plan-ui/index.html#/dashboard" title="Trang chủ taophacdo" allow="clipboard-write"></iframe>`;\n}\n';
  fs.writeFileSync('public/plans.js', head + newMiddle + tail);
  console.log("Fixed");
}
