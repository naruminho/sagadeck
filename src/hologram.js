// Geometrias projetadas em perspectiva; a tipografia e o conteúdo continuam nativos.
export function drawHologram(ctx,o,t,w,h){
 const unit=Math.min(w,h),project=(v,l)=>{
  const a=t*l.speed*.12+l.rotation,ca=Math.cos(a),sa=Math.sin(a),x=v[0]*ca+v[2]*sa,z=-v[0]*sa+v[2]*ca,y=v[1]*Math.cos(.38)-z*Math.sin(.38),depth=z*Math.cos(.38)+v[1]*Math.sin(.38),p=3.8/(3.8+depth);
  return [w*l.x+x*unit*l.scale*p,h*l.y+y*unit*l.scale*p,depth];
 };
 const line=(vertices,l,color,closed=false)=>{ctx.beginPath();vertices.forEach((v,i)=>{const p=project(v,l);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});if(closed)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=Math.max(.6,unit/1000);ctx.stroke();};
 const ring=(l,radius,tilt,color)=>{const v=[];for(let i=0;i<=96;i++){const a=i*Math.PI/48;v.push([radius*Math.cos(a),radius*Math.sin(a)*Math.sin(tilt),radius*Math.sin(a)*Math.cos(tilt)]);}line(v,l,color);};
 ctx.save();ctx.globalAlpha=o.opacity;
 for(const l of o.layers){
  ctx.save();
  if(l.shape==='sphere'){
   for(let j=-3;j<=3;j++){const phi=j*Math.PI/9,v=[];for(let n=0;n<=64;n++){const a=n*Math.PI/32;v.push([Math.cos(phi)*Math.cos(a),Math.sin(phi),Math.cos(phi)*Math.sin(a)]);}line(v,l,o.foreground);}
   for(let j=0;j<8;j++){const a=j*Math.PI/4,v=[];for(let n=0;n<=64;n++){const p=-Math.PI/2+n*Math.PI/64;v.push([Math.cos(p)*Math.cos(a),Math.sin(p),Math.cos(p)*Math.sin(a)]);}line(v,l,o.foreground);}
  }else if(l.shape==='cube'){
   const v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
   for(const ids of [[0,1,2,3],[4,5,6,7]]){const face=ids.map(i=>project(v[i],l));ctx.beginPath();face.forEach((p,i)=>i?ctx.lineTo(...p.slice(0,2)):ctx.moveTo(...p.slice(0,2)));ctx.closePath();ctx.save();ctx.globalAlpha*=.08;ctx.fillStyle=o.secondary;ctx.fill();ctx.restore();line(ids.map(i=>v[i]),l,o.foreground,true);}
   for(let i=0;i<4;i++)line([v[i],v[i+4]],l,o.foreground);
  }else if(l.shape==='plane'){
   for(let j=-4;j<=4;j++){const n=j/4;line([[-1,n,0],[1,n,0]],l,o.secondary);line([[n,-1,0],[n,1,0]],l,o.secondary);}
   line([[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],l,o.foreground,true);
  }
  ring(l,1.3,.15,o.secondary);ring(l,1.45,1.3,o.accent);
  for(let i=0;i<48;i++){const a=i*Math.PI/24;line([[1.48*Math.cos(a),0,1.48*Math.sin(a)],[(i%4?1.51:1.57)*Math.cos(a),0,(i%4?1.51:1.57)*Math.sin(a)]],l,i%4?o.secondary:o.accent);}
  const orbit=t*l.speed*.24+l.rotation,p=project([1.3*Math.cos(orbit),.2,1.3*Math.sin(orbit)],l);
  ctx.fillStyle=o.accent;ctx.beginPath();ctx.arc(p[0],p[1],Math.max(1,unit/500),0,Math.PI*2);ctx.fill();
  ctx.restore();
 }
 ctx.restore();
}
