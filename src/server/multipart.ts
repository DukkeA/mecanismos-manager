import 'server-only';import {DomainError} from '@/domain/errors';
export async function boundedForm(request:Request,maxBytes=3*1024*1024+65536){
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new DomainError('Origen no permitido.');const reader=request.body?.getReader();if(!reader)throw new DomainError('Selecciona un archivo.');const parts:Uint8Array[]=[];let size=0;for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes){await reader.cancel();throw new DomainError('El archivo supera el tamaño permitido.');}parts.push(part.value);}return new Response(Buffer.concat(parts),{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();
}
