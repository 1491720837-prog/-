import {publicStream} from './public-network.mjs';
export async function captureImages(input){
  if(!Array.isArray(input)||input.length>12||input.some(x=>typeof x!=='string'||x.length>8000))throw Error('每次最多保存 12 张文章图片');
  const images=[];for(const url of input){try{
    const {response}=await publicStream(url,{signal:AbortSignal.timeout(15000)}),chunks=[];let bytes=0;
    if(Number(response.headers['content-length'])>2_000_000){response.destroy();throw Error('图片超过 2 MB');}
    for await(const chunk of response){bytes+=chunk.length;if(bytes>2_000_000){response.destroy();throw Error('图片超过 2 MB');}chunks.push(chunk);}
    const b=Buffer.concat(chunks);let type;if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';else if(b[0]===255&&b[1]===216&&b[2]===255)type='image/jpeg';else if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')type='image/webp';else throw Error('图片格式不支持');
    images.push({url,data:'data:'+type+';base64,'+b.toString('base64')});
  }catch(e){images.push({url,error:e.message});}}
  return {images};
}
