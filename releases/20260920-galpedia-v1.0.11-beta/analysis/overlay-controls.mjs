import {field} from './model.mjs';
const $=id=>document.getElementById(id);
const precision=n=>!Number.isFinite(n)?'—':n!==0&&Math.abs(n)<.001?n.toExponential(2):n.toLocaleString('zh-CN',{maximumFractionDigits:3});
export function syncOverlayControls(state){
  const curveView=state.chart==='density'&&state.densityStyle==='curve';
  const scatter=state.chart==='scatter',distribution=['histogram','density','box'].includes(state.chart);
  $('overlay-control').hidden=curveView||!scatter&&!distribution;$('overlay-control-label').textContent=scatter?'趋势线':'平滑密度';
  const entries=[['none',scatter?'关闭趋势线':'关闭平滑密度'],...(scatter?[['regression','直线趋势 · 线性回归'],['lowess','平滑趋势 · LOWESS']]:distribution?[['kde',state.chart==='histogram'?'平滑密度曲线':'平滑密度轮廓']]:[])];
  $('overlay-type').replaceChildren(...entries.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));
  $('overlay-type').value=scatter&&state.trendLine?(state.trendMethod==='lowess'?'lowess':'regression'):distribution&&state.densityCurve?'kde':'none';
  $('lowess-control').hidden=!scatter||!state.trendLine||state.trendMethod!=='lowess';$('lowess-fraction').value=state.lowessFraction;
  $('scatter-density-control').hidden=!scatter;$('scatter-density').checked=state.scatterDensity;
  $('cumulative-control').hidden=state.chart!=='histogram';$('cumulative-curve').checked=state.cumulativeCurve;
  $('smoothing-control').hidden=!(curveView||distribution&&state.densityCurve||scatter&&state.scatterDensity);$('smoothing').value=state.smoothing;
}
function describeOverlay(overlay,result){
  const scope='使用完整绘图样本；选中或放大视野不重新拟合。';
  let title,description,method,available;
  if(overlay.kind==='scatter-layers'){
    const d=overlay.density;available=d.available||!!overlay.fit?.available;
    const fit=overlay.fit?describeOverlay({kind:'regression',fit:overlay.fit},result):null;
    title=(d.available?`二维密度等高线 · n = ${d.n.toLocaleString()}`:'二维密度未绘制')+(fit?' ｜ '+fit.title:'');
    description=(d.available?'浅 → 深线条分别为密度峰值的 10%、25%、50%、75%；表示局部集中程度，并非圈内版本占比。'+(d.logX?'密度在 log₁₀(横轴) 空间估计。':'')+scope:d.reason)+(fit?' '+fit.description:'');
    method='二维乘积高斯核密度，Scott 二维带宽乘所选平滑倍数；使用全部绘图版本，129 × 129 网格提取等高线。颜色分组不分别拟合。'+(fit?fit.method:'');
  }else if(overlay.kind==='histogram-layers'){
    const kde=overlay.curve?describeOverlay({kind:'histogram-kde',curve:overlay.curve},result):null;
    available=overlay.cdf.n>0||!!kde?.available;
    title=`累计分布 ECDF · n = ${overlay.cdf.n.toLocaleString()}`+(kde?' ｜ '+kde.title:'');
    description='玫红阶梯线读右侧 0–100% 轴，表示小于等于横轴数值的版本比例。柱子'+(kde?'与青色密度曲线':'')+'读左侧版本数轴。'+(kde?kde.description:'选择或放大视野不会改变累计分布的分母。');
    method='经验累计分布使用原始有效数值直接累计，同值一起跃升，不分箱、不平滑。'+(kde?kde.method:'');
  }else if(overlay.kind==='regression'){
    const f=overlay.fit;available=f.available;
    if(f.method==='lowess')return {available,title:f.available?`平滑趋势 · LOWESS · n = ${f.n.toLocaleString()}`:'平滑趋势未绘制',description:f.available?`每处参考附近 ${Math.round(f.fraction*100)}% 的版本，观察弯曲变化；按横轴距离加权。`+(f.logX?'横轴使用 log₁₀。':'')+scope:f.reason,method:'LOWESS 局部线性回归，三次立方核距离权重；不进行残差鲁棒迭代。在最多 129 个位置求值，全部样本参与邻域选择，不外推。'};
    if(f.available){
      const x=f.logX?'log₁₀(横轴)':'横轴';
      title=`线性回归 · n = ${f.n.toLocaleString()} · R² = ${f.rSquared===null?'—':f.rSquared.toFixed(3)}`;
      description=`拟合值 = ${precision(f.meanY)} ${f.slope<0?'−':'+'} ${precision(Math.abs(f.slope))} × (${x} − ${precision(f.meanX)})。`+scope;
      if(f.rSquared===null)description+='纵轴数值完全相同，R² 不定义。';
    }else{title='线性回归未绘制';description=f.reason;}
    method='叠加最小二乘线性回归，所有绘图版本等权；对数横轴使用 log₁₀(x) 拟合。仅绘制已有横轴数据范围，不外推。R² 描述样本内拟合程度。';
  }else if(overlay.kind==='histogram-kde'){
    const c=overlay.curve;available=c.available;
    title=c.available?`平滑密度曲线 · n = ${c.n.toLocaleString()} · 带宽 ${precision(c.bandwidth)} ${field(result.state.x).unit}`:'密度曲线未绘制';
    description=c.available?'曲线按样本数 × 分箱宽度换算到版本数量轴。'+scope:c.reason+'，保留原直方图。';
    method='叠加高斯核密度估计，以 Silverman 单变量规则确定带宽，再乘所选平滑倍数。曲线是连续估计，原始分箱与版本数不变。';
  }else{
    const valid=overlay.curves.filter(c=>c.available);available=valid.length>0;
    title=`平滑密度轮廓 · ${valid.length} / ${overlay.curves.length} 组`;
    description=(overlay.countScale?'宽度表示平滑版本数密度':'宽度表示平滑组内概率密度')+'，所有组共用宽度标尺。'+scope;
    if(valid.length<overlay.curves.length)description+=`${overlay.curves.length-valid.length} 组样本不足或数值完全相同，保留主图。`;
    method='各组独立计算高斯核密度估计，使用 Silverman 带宽与统一平滑倍数；轮廓越宽，对应数值附近的平滑密度越高。每个版本在同一组内仅计一次，组间可重叠。';
  }
  return {title,description,method,available};
}
export function renderOverlaySummary(result){
  const overlay=result.overlay;$('overlay-summary').hidden=!overlay;$('layer-legend').replaceChildren();
  if(!overlay)return '';
  const info=describeOverlay(overlay,result);$('overlay-summary').dataset.kind=overlay.kind==='regression'&&overlay.fit?.method==='lowess'?'lowess':overlay.kind;
  $('overlay-title').textContent=info.title;$('overlay-description').textContent=info.description;
  const keys=[];
  if(overlay.kind==='scatter-layers'){
    if(overlay.density.available)for(const [label,color] of [['密度峰值 10%','#85b7b8'],['25%','#529799'],['50%','#207578'],['75%','#084c50']])keys.push([label,color]);
    if(overlay.fit?.available)keys.push(overlay.fit.method==='lowess'?['平滑趋势','#2670bb']:['线性回归','#bf682e']);
  }else if(overlay.kind==='histogram-layers'){
    if(overlay.curve?.available)keys.push(['密度曲线 · 左轴','#167a81']);
    if(overlay.cdf.n)keys.push(['累计分布 · 右轴','#b13a73']);
  }
  $('overlay-line-key').hidden=!info.available||keys.length>0;
  $('layer-legend').replaceChildren(...keys.map(([label,color])=>{const span=document.createElement('span'),key=document.createElement('i');key.style.background=color;span.append(key,document.createTextNode(label));return span;}));
  return info.method;
}
