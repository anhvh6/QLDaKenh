import test from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
import {parseVtpExport,carrierAmount,carrierText} from '../server/viettelpost-export.mjs';
test('official XLSX export reads real zero, text phone and rejects duplicate tracking',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('Danh sach van don');s.addRow(['Title']);
 s.addRow(['Mã Vận Đơn','Mã đơn hàng','Người nhận','Địa chỉ nhận','ĐT Nhận','Giá trị','Tiền thu hộ (4)','Tổng phí (9)= (3)+(5)+(6)+(7)-(8)','Trạng Thái']);
 const values=['PKE-QA','MOC-QA','QA','Address','0901234567','260,000',0,23519,'Đã tiếp nhận'];s.addRow(values);
 const base64=async()=>Buffer.from(await w.xlsx.writeBuffer()).toString('base64');const [r]=await parseVtpExport(await base64());
 assert.equal(r.cod,0);assert.equal(r.phone,'0901234567');assert.equal(r.declaredValue,260000);assert.equal(r.fee,23519);
 s.addRow(values);await assert.rejects(parseVtpExport(await base64()),/trùng/);
 assert.equal(carrierAmount(-1),null);assert.equal(carrierAmount(null),null);assert.equal(carrierAmount(0),0);assert.equal(carrierText('******'),'');
});
