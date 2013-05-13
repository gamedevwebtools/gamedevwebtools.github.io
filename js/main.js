/**
 * Gamedevwebtools - main.js.
 * 
 * This is a client side application.
 */
window.WebSocket = window.WebSocket || window.MozWebSocket;

var logging = {
	//Sources
	Local: 0,
	Remote: 1,
	
	//Levels
	Trace: 0,
	Debug: 1,
	Information: 2,
	Warning: 3,
	Error: 4,
	Critical: 5,
	Fatal: 6,
	
	message: function(source,level,str) {}
};

/** Local storage fallback for older browsers */
if(!localStorage) {
	localStorage = {
		getItem: function(i){ return null; },
		setItem: function(i,v) {}
	};
	console.log("Warning - local storage isn't supported!");
}

/**
 * Application.
 * 
 * This is a singleton responsible for communication between the client
 * and the actual application.
 */
var application = null;
function Application() {
	// Information.
	this.name = "";
	this.threadCount = 4;
	this.active = true;
	
	this.ws = null;//websocket object.
	this.averageFps = 0;
	
	var opt = localStorage.getItem('application.options');
	if(opt){
		this.options = JSON.parse(opt);
	} else {
		this.options = {
			autoConnect: true,
			autoConnectServer: 'localhost:8080',
		};
		localStorage.setItem('application.options',
		JSON.stringify(this.options));
	}
	
	// message handlers.
	this.handlers = {};
	this.handle("tooling.server.application.connected", function(frameId,val){
		application.log('The application connected to the piping server.');
	});
	this.handle("tooling.server.application.disconnected", function(frameId,val){
		application.log('The application disconnected from the piping server.');
	});
	this.handle("application.monitoring.frame", function(val){
		frameData.push(frameData.arrays.dt,[val.t,val.dt*1000.0]);
		ui.onFrame(val);
		ui.frameDt.update(frameData.arrays.dt,{push: true});
	});
	this.handle("application.profiling.result", function(val){
		data.push(data["application.profiling.result"],val);
	});
	this.handle("application.profiling.task.timer", function(val){
		var frameId = val.frame;
		if(frameData.checkFrame(frameId)){
			if(frameData.scratchArrays.taskProfiles){					
				frameData.push(frameData.arrays.taskProfiles,
					frameData.scratchArrays.taskProfiles);
				ui.profilingThreads.update(true);
			}
			frameData.scratchArrays.taskProfiles = new Array;
		}
		frameData.scratchArrays.taskProfiles.push(val);
	});
	this.handle("application.log", function(val) {
		logging.message(logging.Remote,
		(typeof val.lvl) == "number"? val.lvl : logging.Fatal,
		(typeof val.msg) == "string"? val.msg : "**Missing message**");
	});
	this.handle('application.information',function(info) {
		var change = false;
		if((typeof info.name) == "string") {
			application.name = info.name;
			change = true;
		}
		if((typeof info.threadCount) == "number") {
			application.threadCount = info.threadCount;
			change = true;
		}
		if(change) application.raiseEvent('change');
	});
	
	// connection event handlers.
	this.eventHandlers = {};
	this.okToDisconnect = false;
	this.on('connected',function() {
		frameData.reset();
	});
}
Application.prototype.on = function(event,callback) {
	if((typeof callback) !== "function"){
		this.error("application.on needs a function callback");
	}
	if(event in this.eventHandlers){
		this.eventHandlers[event].push(callback);
	} else {
		this.eventHandlers[event] = [ callback ];
	}
}
Application.prototype.removeEventHandler = function(event,callback) {
	if(!(event in this.eventHandlers)) return;
	if((typeof callback) !== "function") {
		this.error("application.removeEvent needs a valid callback id.");
	}
	if(event in this.eventHandlers){
		var callbacks = this.eventHandlers[event];
		for(var i = 0;i<callbacks.length;++i) {
			if(callbacks[i] === callback) {
				callbacks.splice(i,1);
			}
		}
	}
}
Application.prototype.raiseEvent = function(event) {
	if(event in this.eventHandlers){
		var callbacks = this.eventHandlers[event];
		for(var i = 0;i<callbacks.length;++i)
			callbacks[i]();
	}
}
Application.prototype.handle = function(msg,callback) {
	if((typeof callback) !== "function"){
		this.error("application.handle needs a function callback");
	}
	if(msg in this.handlers){
		this.error("The message '"+msg+"' already has a handler");
	}
	else this.handlers[msg] = callback;
}
Application.prototype.onInit = function() {
	if(this.options.autoConnect !== true) return;
	
	function onConnected() {
		cleanup();
	}
	function onDisconnected() {
		application.log(
		"Couldn't automatically connect to ws://"+
		application.options.autoConnectServer+"!");
		cleanup();
	}
	function cleanup() {
		application.removeEventHandler('connected',onConnected);
		application.removeEventHandler('disconnected',onDisconnected);
		application.on("disconnected",function(event) {
			if(!application.okToDisconnect)
				application.error('The connection to the application was lost');
			else {
				application.log('Disconnected from the application.');
				application.okToDisconnect = false;
			}
			application.ws = null;
		});
	}
	
	this.on('connected',onConnected);
	this.on('disconnected',onDisconnected);
	this.connect(this.options.autoConnectServer);
}
Application.prototype.updateOptions = function(opt){
	this.options = opt;
	localStorage.setItem('application.options',
		JSON.stringify(this.options));
}
Application.prototype.log = function(msg) {
	logging.message(logging.Local,logging.Information,msg);
}
Application.prototype.error = function(msg) {
	logging.message(logging.Local,logging.Error,msg);
}
Application.prototype.connect = function(server) {
	this.ws = new WebSocket('ws://' + server);
	this.ws.onopen = function() {
		application.log('Connected to ws://' + server);
		application.raiseEvent('connected');
	};
	this.ws.onerror = function(event) {
		application.error("Websockets error" + JSON.stringify(event));
	};
	this.ws.onmessage = function(message){
		var reader = new FileReader();
		reader.readAsArrayBuffer(message.data);
		reader.onloadend = function() {
			var u8view = new Uint8Array(this.result);
			
			var offset = 0;
			// FIXME: Endianess.
			while(offset < u8view.length){
				// Decode the message.
				var hdrView = new Uint32Array(this.result,offset,1);
				var headerLength = hdrView[0];
				var str = "";
				offset+=4;
				for(var end = offset + headerLength;offset<end;++offset) {
					str += String.fromCharCode(u8view[offset]);
				}
				var object = JSON.parse(str);	
				// Act based on the header.
				var handler = application.handlers[object.type];
				if(handler) handler(object);
				else application.error("Unknown message - " + 
					JSON.stringify(object));
			};
		};
	};			
	this.ws.onclose = function(event){ 
		application.raiseEvent('disconnected');
	}
}
Application.prototype.disconnect = function() {
	if(this.ws){
		this.okToDisconnect = true;
		this.ws.close();
	}
}
Application.prototype.send = function(type,value) {
	if(this.ws === null){
		this.error("Can't send a message '"+type+"' - the application isn't connected!");
		return;
	}
	if(!value) value = {};
	value.type = type;
	
	var object = JSON.stringify(value);
	var buffer  = new ArrayBuffer(object.length + 4);
	var u32view = new Uint32Array(buffer,0,1);
	u32view[0] = object.length;
	var u8view = new Uint8Array(buffer,4,object.length);
	for(var i = 0;i<object.length;++i){
		u8view[i] = object.charCodeAt(i);
	}
	this.ws.send(buffer);	
}
Application.prototype.activate = function() {
	this.send('application.service.activate');
	this.raiseEvent('activate');
	this.active = !this.active;
}
Application.prototype.quit = function() {
	this.okToDisconnect = true;
	this.send('application.service.quit');
}
Application.prototype.step = function() {
	this.send('application.service.step');
}

var frameData = (function(){
	var frameData = { frameCount: 200,frameId: 0, 
		arrays: {}, 
		scratchArrays: { taskProfiles: [] } };
		
	frameData.reset = function() {
		frameData.frameId = 0;
	};
	
	frameData.push = function (data,value) {
         var last = frameData.frameCount - 1;
         for(var i = 0;i<last;++i){
             data[i] = data[i+1];
         }
         data[last] = value;	
	};
	frameData.checkFrame = function(id) {
		if(frameData.frameId < id){
			frameData.frameId = id;
			return true;
		}
		return false;
	};
	
	function createArray(name,value){
		frameData.arrays[name] = [];
		var data = frameData.arrays[name];
		for(var i = 0;i<frameData.frameCount;++i){
			data[i] = value;
		}
	}
	createArray("dt",[0.0,0.0]);
	createArray("taskProfiles",[]);
	
	return frameData;
})();

var data = (function(){
	var data = { "application.profiling.result":[] };
	data.push = function(array,value) {
		array.push(value);
	};
	return data;
})();


$(document).ready(function () {

	application = new Application();
	ui = new Ui();
	
	ui.frameDt = new FrameDtView();
	ui.profilingResults = new ProfilingTimerView();
	ui.profilingThreads = new ProfilingThreadView();
	
	application.onInit();
});
