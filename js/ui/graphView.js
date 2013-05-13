
/**
 * Graph view plots a graph.
 */
function GraphView(widgetId,data,options) {
	if((typeof widgetId) !== "string") return;
	
	this.widget = $('#'+widgetId);
	var c = $("#"+widgetId+" div canvas");
	this.sel = c;
	this.canvas = c[0];
	this.innerWidth = 0;
	this.data = data;
	this.isVisible = false;
	this.needsRedraw = false;
	
	if(options && options.labels && 
		(typeof options.labels) === "object"){
		this.labels = options.labels;
	} else this.labels = ["",""];
	
	//Currently selected point.
	this.curPoint = -1;
	
	this.yValueMin = 0; this.yValueMax = 60;
	this.xValueMin = 0; this.xValueMax = 0;
	this.xAxisOffset = 30;this.yAxisOffset = 30;
	
	// The viewport for the actuall graph
	this.viewX = 0;
	this.viewY = 0;
	this.viewWidth = 0;
	this.viewHeight = 0;
	
	// Components.
	this.viewComponent = new ViewportComponent(this,this.sel);	
	this.infoComponent = new ControlComponent(this,this.sel);
	// An array of points. (2x float32 per each point)
	this.points = null;
	
	var self = this;
	this.sel.mouseleave(function(e) {
		var prev = self.curPoint;
		self.curPoint = -1;
		if(prev !== -1)
			self.needsRedraw = true;
	});
}
GraphView.prototype.axisUnits = 
	new Float32Array([0.5,1,5,10,20,50,100,1000]);
GraphView.prototype.yAxisLabelMinHeight = 30;
GraphView.prototype.xAxisLabelMinWidth = 40;
GraphView.prototype.onViewportComponentUpdate = function() {
	this.needsRedraw = true;
}
GraphView.prototype.onControlComponentMouseMove = function(event) {
	var point = this.getPointAt(event.x,event.y);
	var prev = this.curPoint;
	this.curPoint = point;
	if(prev !== point) {
		this.needsRedraw = true;
	}
}
GraphView.prototype.onShow = function() {
	this.isVisible = true;
	this.resize();
};
GraphView.prototype.onHide = function() {
	this.isVisible = false;
}
GraphView.prototype.resize = function() {
	if(!this.isVisible) return;
	this.canvas.width = this.sel.innerWidth();
	this.canvas.height = 400;
	
	// viewport
	this.viewX = this.xAxisOffset;
	this.viewY = 0;
	this.viewWidth = this.canvas.width - this.xAxisOffset;
	this.viewHeight = this.canvas.height - this.yAxisOffset;
	
	this.needsRedraw = true;
	this.draw();
}
GraphView.prototype.setYValueLimits = function(min,max) {
	this.yValueMin = min; this.yValueMax = max;
	this.xAxisOffset = 30;
}
GraphView.prototype.update = function(data,options) {
	this.data = data;
	this.needsRedraw = true;
}
GraphView.prototype.layoutFrames = function() {
	var data= this.data;
	if(!data.length) return;
	
	// Update the points array.
	if(!this.points || this.points.length < data.length)
		this.points = new Float32Array(data.length*2);
	var points = this.points;
	
	// Difference between the highest and the lowest value.
	var dx = data[0][0];
	for(var i = 0;i<data.length;++i){
		if(data[i][0] > dx) dx = data[i][0];
	}
	this.xValueMin = data[0][0];
	this.xValueMax = dx;
	dx = dx - data[0][0];
	if(dx != 0){
		var scaleX = this.viewWidth / dx;
	} else var scaleX = 1;
	
	var viewx = this.viewX;//this.viewComponent.translationX*this.viewComponent.scaleX;	
	//var scaleX = this.pixelsPerSecond;// * this.viewComponent.scaleX;
	var scaleY = (1/(this.yValueMax - this.yValueMin)) * this.viewHeight;
	var j = 0;
	var firstx = data[0][0];
	var ymin = this.yValueMin;
	for(var i = 0;i<data.length;++i){
		var point = data[i];
		points[j] = Math.round(viewx + (point[0] - firstx) * scaleX);		
		points[j+1] = this.viewHeight - 
			Math.round((point[1]-ymin) * scaleY);
		j+=2;
	}
	return scaleX;
}
GraphView.prototype.getPointAt = function(x,y) {
	var points = this.points;
	if(!points.length) return -1;
	var px,dy,dist;	
	var minDist = this.viewWidth*this.viewHeight;
	var min = -1;
	for(var i = 2;i<points.length;i+=2){
		px = points[i] - x;py = points[i+1] - y;
		dist = px*px + py*py;
		if(dist < minDist){
			minDist = dist;
			min = i;
		}
	}
	return min;
}
GraphView.prototype.draw = function() {
	if(!this.isVisible || !this.needsRedraw) return;
	var ctx=this.canvas.getContext("2d");
	//Set the font.
	ctx.font="14px Arial";
	var fdata = frameData.arrays.taskProfiles;
	if(!fdata.length) return;
	var textColour = this.sel.css('color');
	if(!textColour) textColour = "#000000";
	
	var scaleX = this.layoutFrames();
	
	//Background.
	ctx.fillStyle="#FFFFFF";
	ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
	
	//Axes
	ctx.strokeStyle = "#A0A0A0";
	ctx.lineWidth = 1;
	var y = this.viewY + this.viewHeight;
	
	ctx.beginPath();
	ctx.moveTo(this.viewX-1,this.viewY);
	ctx.lineTo(this.viewX-1,y);
	ctx.stroke();
	
	ctx.beginPath();
	ctx.moveTo(this.viewX,y);
	ctx.lineTo(this.viewX + this.viewWidth,y);
	ctx.stroke();		
	
	//Labels.
	ctx.fillStyle=textColour;
	ctx.strokeStyle = "#A0A0A0";
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	
	var ymin = this.yValueMin;
	var ydiff = this.yValueMax - this.yValueMin;
	var scaleY = (1/ydiff) * this.viewHeight;
	var units = this.axisUnits;
	
	for(var i = 0;i<units.length;++i){
		var count = Math.ceil(ydiff/units[i]);
		if((this.viewHeight/count) > this.yAxisLabelMinHeight){
			scaleY = units[i] * scaleY;
			for(var j = 0;j<count;++j){
				y = this.viewHeight - Math.round(j*scaleY);	
				if(j != 0){
					ctx.beginPath();
					ctx.moveTo(this.viewX,y);
					ctx.lineTo(this.viewX + this.viewWidth,y);
					ctx.stroke();
				}
				
				ctx.fillText(''+(j*units[i] + ymin),this.viewX - 3,y);
			}
			break;
		}
	}
	

	
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	
	var xmin = this.xValueMin;
	var xdiff = this.xValueMax - this.xValueMin;
	if(xdiff < 0.01) return;
	for(var i = 0;i<units.length;++i){
		var count = Math.ceil(xdiff/units[i]);
		if((this.viewWidth/count) > this.xAxisLabelMinWidth){
			var xroundedmin = Math.ceil(xmin/units[i])*units[i];
			xdiff = this.viewX +(xroundedmin - xmin) * scaleX;
			for(var j = 0;j<count;++j){
				y = xdiff + Math.round( (j*units[i]) * scaleX);
				ctx.beginPath();
				ctx.moveTo(y,this.viewY);
				ctx.lineTo(y,this.viewY + this.viewHeight);
				ctx.stroke();			
				
				ctx.fillText(''+(j*units[i]+xroundedmin),y,
					this.viewY + this.viewHeight + 2);
			}
		}
	}
	
	//Points.
	var points = this.points;
	if(!points.length) return;
	var x,y,prevX,prevY;
	prevX = points[0];prevY = points[1];
	
	ctx.strokeStyle = "#339966";
	ctx.fillStyle = "#339966";
	ctx.fillRect(prevX-1,prevY-1,3,3);
	for(var i = 2;i<points.length;i+=2){
		x = points[i];y = points[i+1];
		ctx.beginPath();
		ctx.moveTo(prevX,prevY);
		ctx.lineTo(x,y);
		ctx.stroke();
		ctx.fillRect(x-1,y-1,3,3);
		prevX = x;prevY = y;
	}
	
	
	if(this.curPoint !== -1){
		x = points[this.curPoint];y = points[this.curPoint+1];
		ctx.fillRect(x-3,y-3,6,6);
		
		var point = this.curPoint/2;
		var strX = this.data[point][0].toFixed(3);
		var strY = this.data[point][1].toFixed(3);
		x = Math.max(ctx.measureText(strX).width,
			ctx.measureText(strY).width);
		var labels = this.labels;
		y = Math.max(ctx.measureText(labels[0]).width,
			ctx.measureText(labels[1]).width);
		x = x+y;
		y = this.viewX + this.viewWidth - x;
		
		ctx.fillStyle = "#FFFFFF";
		ctx.fillRect(y - 3,this.viewY,x+3,40);
		
		ctx.fillStyle = textColour;
		ctx.textAlign = 'left';
		ctx.fillText(labels[0],y,this.viewY);
		ctx.fillText(labels[1],y,this.viewY + 20);
			
		ctx.textAlign = 'right';
		ctx.fillStyle = "#339966";
		ctx.fillText(strX,
			this.viewX+this.viewWidth,this.viewY);
		ctx.fillText(strY,
			this.viewX+this.viewWidth,this.viewY + 20);
	}
	this.needsRedraw = false;
}
