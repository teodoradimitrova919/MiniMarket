import {serviceError} from './service-errors.js';
export const ATTACHMENT_BUCKET='listing-attachments';
export const MAX_ATTACHMENT_BYTES=5*1024*1024;
export const MAX_LISTING_ATTACHMENTS=5;
const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
export function validateAttachmentFile(file){
  if(!file||!Object.hasOwn(extensions,file.type))throw serviceError('Choose a JPG, PNG, WebP image or a PDF document.','VALIDATION_ERROR');
  if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_ATTACHMENT_BYTES)throw serviceError('Files must be non-empty and no larger than 5 MB.','VALIDATION_ERROR');
  if(typeof file.name!=='string'||!file.name.trim()||file.name.length>255||/[\x00-\x1f\x7f]/.test(file.name))throw serviceError('Choose a file with a valid filename of at most 255 characters.','VALIDATION_ERROR');
  return {name:file.name,type:file.type,size:file.size,extension:extensions[file.type]};
}
export function formatFileSize(bytes){return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`;}
