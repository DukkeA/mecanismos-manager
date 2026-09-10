import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {id:"/",name:"Mecanismos Manager",short_name:"Mecanismos",description:"Gestión interna del taller",lang:"es-CO",start_url:"/",scope:"/",display:"standalone",background_color:"#f4f7fa",theme_color:"#087484",icons:[
    {src:"/icons/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
    {src:"/icons/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"},
    {src:"/icons/maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"},
  ]};
}
