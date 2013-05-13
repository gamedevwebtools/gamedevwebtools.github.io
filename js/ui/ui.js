/**
 * Render using requestAnimationCallback because if the game has high
 * FPS, we woulnd't want to redraw the graphs on each frame.
 */
// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
((function() {
    var lastTime = 0;
    var vendors = ['webkit', 'moz'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame =
          window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };

    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
})());


/**
 * Ui
 * 
 * This is a singleton responsible for the application's ui.
 */
var ui = null;
function Ui() {
	this.currentTool = null;
	this.currentSubTab = null;
	this.currentSubTabName = "";
	this.consoleHistory = [];
	this.consoleHistoryIndex = 0;
	
	window.onbeforeunload = function(){
		application.disconnect();
	};
	$(window).resize(function(){
		ui.frameDt.resize();
		ui.profilingThreads.resize();
	});
	
	// Application bar
	$(".applicationBar form").submit(function(){
		return false;
	});
	function connect() {
		application.connect($("#serverAddressInput").val());		
	}
	$("#applicationNotConnectedControls button").click(connect);
	$("#serverAddressInput").jkey('enter',connect);
	
	application.on('change', function() {
		$("#appTitle b").text(application.name);
	});
	application.on('connected',function() {
		$("#applicationNotConnectedControls").hide();
		$("#applicationConnectedControls").show();	
	});
	application.on('disconnected',function() {
		$("#applicationConnectedControls").hide();
		$("#applicationNotConnectedControls").show();
	});
	application.on('activate',function() {
		if(application.active){
			$("#appActivateIcon").removeClass('icon-pause').addClass('icon-play');
			$("#appStepButton").show();
		} else {
			$("#appActivateIcon").removeClass('icon-play').addClass('icon-pause');
			$("#appStepButton").hide();		
		}
	});
	
	this.averageFps = 0;
	this.appFpsText = $("#appFps span");
	var f = function(){
		ui.appFpsText.text(ui.averageFps.toFixed(0));
		setTimeout(f,1000);
	};
	setTimeout(f,1000);
	

	
	// Monitoring tab
	$("#tabProfiling a").click(function(){
		ui.showSubTab('tabProfiling');
	});
	$("#tabProfilingTabGraph").click(function(){
		ui.switchToTool(ui.frameDt);
	});
	$("#tabProfilingTabThreads").click(function(){
		ui.switchToTool(ui.profilingThreads);
	});
	$("#tabProfilingTabTimers").click(function(){
		ui.switchToTool(ui.profilingResults);
	});
	
	// Options tab
	$("#tabOptions a").click(function(){
		ui.showSubTab('tabOptions');
		ui.switchToTool(ui.optionsView);
	});
	this.optionsView = new OptionsView($("#optionsView"));
	
	// Help tab
	$("#tabHelp a").click(function() {
		ui.showSubTab('tabHelp');
		ui.switchToTool(ui.helpView);
	});
	this.helpView = new HelpView($("#helpView"));
	
	this.showSubTab('tabProfiling');
	
	
	this.shortcuts = [
	{key:'esc', name: 'Exit application',action: function(){
		application.quit();
	}},
	{key:'tab',name: 'Console', action: function(){
		ui.switchToConsole();
	}}
	];
	this.updateShortcuts();
	
	// Console.
	$("#logoutputView").click(function(){
		ui.switchToConsole();
	});
	$("#logoutputView input").jkey('enter',function(){
		ui.consoleCommand($("#logoutputView input").val());
		$("#logoutputView input").val('');	
	});
	$("#logoutputView input").jkey('up',function(){
		ui.consoleUp();
	});
	$("#logoutputView input").jkey('down',function(){
		ui.consoleDown();
	});
	
	var self = this;
	(function renderloop(){
		requestAnimationFrame(renderloop);
		self.draw();
	})();
	
	this.logSizeBar = new SizeBar('logoutputView','logoutputViewSizer');
	this.logSizeBar.minHeight = 80;
	this.logHtml = '';
	this.logDepth = 0;
	logging.message = function(source,lvl,msg) { 
		ui.appendToLogOutput(source,lvl,msg);
	};
}
Ui.prototype.draw = function() {
	if(this.currentTool && (typeof this.currentTool.draw) == "function") {
		this.currentTool.draw();
	}
}
Ui.prototype.consoleUp = function() {
	if(this.consoleHistoryIndex < this.consoleHistory.length) {
		this.consoleHistoryIndex++;
		$("#logoutputView input").val(this.consoleHistory[
		this.consoleHistory.length - this.consoleHistoryIndex]);
	}
}
Ui.prototype.consoleDown = function() {
	if(this.consoleHistoryIndex > 0) {
		this.consoleHistoryIndex--;
		var text = this.consoleHistoryIndex === 0?
			'' : this.consoleHistory[this.consoleHistory.length - this.consoleHistoryIndex];
				
		$("#logoutputView input").val(text);
		
	}
}
Ui.prototype.switchToConsole = function() {
	$("#logoutputView input").focus();
}
Ui.prototype.consoleCommand = function(value) {
	if((typeof value) !== 'string' || value.length < 1) return;
	this.logHtml = '';
	this.logDepth = 1;
	var success = true;
	try{
		eval(value);
	} catch(e) {
		application.error("Couldn't evaluate '"+value+"'");
		success = false;
	}
	this.logDepth = 0;
	if(success)
		this.consoleHistory.push(value);
	this.consoleHistoryIndex = 0;
	$("#logoutputView div").append('<span><i class="icon-chevron-right"></i> '+
		value+'</span><br>');
	if(this.logHtml.length > 0)
		$("#logoutputView div").append(this.logHtml);
	var view = $("#logoutputView");
	view.scrollTop(view[0].scrollHeight);	
}
Ui.prototype.updateShortcuts = function() {
	var doc = $(document);
	doc.unbind('keydown.jkey');
	for(var i = 0;i<this.shortcuts.length;++i) {
		var shortcut = this.shortcuts[i];
		doc.jkey(shortcut.key,shortcut.action);
	}
}
Ui.prototype.onFrame = function(frame) {
	if(frame.dt > 0.00001){
		var fps = (1.0/frame.dt);
		this.averageFps = (this.averageFps + fps) * 0.5;
	}
};
Ui.prototype.showSubTab = function(subTab){
	if(this.currentSubTab){
		if(this.currentSubTabName == subTab) return;
		currentSubTabStr = subTab;
		this.currentSubTab.slideUp();
	}
	this.currentSubTabName = subTab;
	this.currentSubTab = $('#'+subTab+'Tabs');
	if(this.currentSubTab)
		this.currentSubTab.slideDown();
};
Ui.prototype.switchToTool = function(tool) {
	if(this.currentTool) {
		this.currentTool.widget.hide();
		if(this.currentTool.onHide)
			this.currentTool.onHide();
	}
	if(tool){
		tool.widget.show();
		if(tool.onShow)
			tool.onShow();
	}
	this.currentTool = tool;
};
Ui.prototype.logLevels = [
	"Trace","Debug","Information","Warning",
	"Error","Critical","Fatal"
];
Ui.prototype.logLevelStyles = [
	"","","label-information","label-warning",
	"label-important","label-important","label-important"
];
Ui.prototype.appendToLogOutput = function(source,level,str){
	var html = (this.logDepth === 0? 
		'<span>': '<span class="viewLogInnerMessage">')+ 
		'<span class="label '+this.logLevelStyles[level]+
		'">'+(source == logging.Local? '<i class="icon-wrench"></i> ':'')+
		this.logLevels[level]+'</span><span class="viewLogMessage">'+
		str + '</span></span><br>';
	if(this.logDepth === 0){
		$("#logoutputView div").append(html);
		var view = $("#logoutputView");
		view.scrollTop(view[0].scrollHeight);
	} else {
		this.logHtml+=html;
	}		
}

/**
 * HelpView.
 */
function HelpView(widget) {
	this.widget = widget;
}

/**
 * OptionsView.
 */
function OptionsView(widget) {
	this.widget = widget;
}
OptionsView.prototype.checkbox = function(sel,val) {
	sel.attr('checked',val === true);
	sel.change(function() {
		sel.attr('checked');
	});
}
OptionsView.prototype.onShow = function() {
	if(false){
		/** Disabled shortcut editor */
		var shortcuts = ui.shortcuts;
		var str = "";
		for(var i = 0;i<shortcuts.length;++i) {
			var shortcut = shortcuts[i];
			str += '<dt>'+shortcut.name+
				'</dt><dd><input id="shortcut'+i
				+'" type="text" value="'+shortcut.key+'">'+
				"</input></dd>";
		}		
		$("#optionsViewShortcuts").html(str);
		for(var i = 0;i<shortcuts.length;++i) {
			$("#shortcut" + i).change(function(){
				console.log('modified');
				return false;
			});
		}
	}
	
	this.checkbox($("#optionsAutoconnect"),
		application.options.autoConnect);
	this.checkbox($("#optionsProbe"),true);
	this.checkbox($("#optionsUpdateEachFrame"),true);
}

/**
 * Sizebar is used to resize widgets.
 */
function SizeBar(widget,bar){
	this.widget = $('#'+bar);
	this.widgetForResize = $('#'+widget);
	var self = this;
	this.isDragging = false;
	this.panX = 0;this.panY = 0;
	this.minHeight = 0;this.maxHeight = 0;
	
	this.widgetWidth = 0;this.widgetHeight = 0;
	this.widget.mousedown(function(event){
		self.onMouseDown(event);
	});
	$(document).mouseup(function(event){
		self.onMouseUp(event);
	});
	$(document).mousemove(function(event){
		self.onMouseMove(event);
	});
}
SizeBar.prototype.onMouseDown = function(event) {
	this.panX = event.clientX;
	this.panY = event.clientY;
	this.widgetWidth = this.widgetForResize.width();
	this.widgetHeight = this.widgetForResize.height();
	this.isDragging = true;
};
SizeBar.prototype.onMouseUp = function(event) {
	this.isDragging = false;
};
SizeBar.prototype.onMouseMove = function(event) {
	if(this.isDragging){
		var dx = this.panX - event.clientX;
		var dy = this.panY - event.clientY;	
		var resultingHeight = this.widgetHeight + dy;
		if(resultingHeight > this.minHeight)
			this.widgetForResize.height(this.widgetHeight + dy);
	}
};


function extend(Child, Parent) {
	var F = function() { }
	F.prototype = Parent.prototype
	Child.prototype = new F()
	Child.prototype.constructor = Child
	Child.superclass = Parent.prototype
}

/**
 * 
 */
function FrameDtView() {
	FrameDtView.superclass.constructor.call(this,
		'profilingTimeGraphView',
		frameData.arrays.dt,
		{
			labels: ["Frame start (s): ","DT (ms): "]
		});
	// Plot 0 to 60 ms.
	this.setYValueLimits(0,60);
}
extend(FrameDtView,GraphView);


/**
 * A Table consisting of profiling times.
 */
function ProfilingTimerView() {
	this.widget = $("#profilingResultsView");
	this.tableBody =  $("#profilingResultsView table tbody");
	this.appHandler =
		application.handlers["application.profiling.result"];
	var self = this
	application.handlers["application.profiling.result"] = function(val){
		self.appHandler(val);
		self.tableBody.append('<tr><td>'+
		val.name+'</td><td>'+val.samples+
		'<td>'+(val.mean*1000.0).toFixed(3)+' ms</td>'+
		'<td>'+(val.median*1000.0).toFixed(3)+' ms</td>'+
		'<td>'+(val.stddev*1000.0).toFixed(3)+' ms</td>'+
		'<td>'+(val.total*1000.0).toFixed(3)+' ms</td>'+
		'</td></tr>');
	};
};
