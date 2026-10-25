// Metadata only. OAuth remains drive.file; never request wider account access.
export async function listDriveFiles(user,url,{access,google}){
 const parent=url.searchParams.get('parent')||'',pageToken=url.searchParams.get('pageToken')||'';
 if(parent&&!/^[\w-]{1,200}$/.test(parent)||pageToken.length>4096)throw Object.assign(Error('Tham số thư mục/trang không hợp lệ.'),{status:400});
 const token=await access(user.id);
 return google('https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q:'trashed=false'+(parent?" and '"+parent+"' in parents":''),fields:'files(id,name,mimeType,size,modifiedTime),nextPageToken',pageSize:'20',orderBy:'folder,modifiedTime desc',...(pageToken?{pageToken}:{})}),{headers:{Authorization:'Bearer '+token}});
}
