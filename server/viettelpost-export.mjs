import ExcelJS from 'exceljs';
const text=v=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
const normal=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/\s+/g,' ');
const amount=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(typeof v==='string'?v.replace(/,/g,''):v);return Number.isFinite(n)&&n>=0?n:null;};
export async function parseVtpExport(base64){
 if(typeof base64!=='string'||base64.length>1400000||!base64.length||!/^[A-Za-z0-9+/=\r\n]+$/.test(base64))throw Error('Chọn file XLSX xuất từ Viettel Post, tối đa 1 MB.');
 const workbook=new ExcelJS.Workbook();try{await workbook.xlsx.load(Buffer.from(base64,'base64'));}catch{throw Error('Không đọc được file XLSX.');}
 const rows=[];
 for(const sheet of workbook.worksheets){let headers;
  sheet.eachRow(row=>{const values=row.values;if(!headers){if(values.some(v=>normal(v)==='ma van don'))headers=values.map(normal);return;}
   const value=name=>values[headers.indexOf(normal(name))];const tracking=text(value('Mã Vận Đơn'));if(!tracking)return;
   if(!/^[-A-Za-z0-9]{1,100}$/.test(tracking))throw Error('File có mã vận đơn không hợp lệ.');
   rows.push({tracking,reference:text(value('Mã đơn hàng')),receiverName:text(value('Người nhận')),phone:text(value('ĐT Nhận')),address:text(value('Địa chỉ nhận')),cod:amount(value('Tiền thu hộ (4)')),fee:amount(value('Tổng phí (9)= (3)+(5)+(6)+(7)-(8)')),declaredValue:amount(value('Giá trị')),carrierStatusName:text(value('Trạng Thái')),exportStatusDate:text(value('Ngày chuyển trạng thái'))});
  });
 }
 if(!rows.length||rows.length>100)throw Error('File cần có từ 1 đến 100 vận đơn. Xuất từng đợt theo ngày.');
 if(new Set(rows.map(r=>r.tracking)).size!==rows.length)throw Error('File có mã vận đơn trùng.');return rows;
}
export const carrierAmount=amount;
export const carrierText=v=>/\*/.test(text(v))?'':text(v);
