var SS = SS || {};
SS.SceneView = function(container) {

    var camera, scene, renderer, w, h;
    var overRenderer;

    var mouseOnDown, lastMouseMpos;

    var elevation = 0, azimuth = Math.PI/4;
    var target = { azimuth: Math.PI/4, elevation: Math.PI*3/8 };
    var targetOnDown = { azimuth: target.azimuth, elevation: target.elevation };
    var distance = 1000, distanceTarget = 300;
    var targetScenePosition = new THREE.Vector3(0,0,0);

    
    var state;

    var workplane, cursoid;
    var popupMenu = SS.popupMenu();

    var that = this;
    
    function init() {

	w = container.offsetWidth || window.innerWidth;
	h = container.offsetHeight || window.innerHeight;

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
	camera.up.x = 0;
	camera.up.y = 0;
	camera.up.z = 1;
        scene.add( camera );

	renderer = new THREE.WebGLRenderer({antialias: true});
	renderer.autoClear = true;
	renderer.setClearColorHex(0x080808, 0.0);
	renderer.setSize(w, h);
        renderer.sortObjects = false;

	container.appendChild( renderer.domElement );
        
	container.style.color = '#fff';
	container.style.font = '13px/20px Arial, sans-serif';
        
        scene.add( new THREE.AmbientLight( 0x404040 ) );
        
        addLights();
	workplane = new SS.Workplane({scene: scene});
        cursoid = new SS.Cursoid({scene: scene, workplane: workplane});
	popupMenu = SS.popupMenu();

	renderer.domElement.style.position = 'absolute';

        container.addEventListener('mousedown', onMouseDown, false);
	container.addEventListener('mousewheel', onMouseWheel, false);
	container.addEventListener('DOMMouseScroll', onMouseWheel, false);
	container.addEventListener('mousemove', onMouseMove, false);
	window.addEventListener('keydown', onDocumentKeyDown, false);
	window.addEventListener('keyup', onDocumentKeyUp, false);

	container.addEventListener('mouseover', function() {
	    overRenderer = true;
	}, false);
	container.addEventListener('mouseout', function() {
	    overRenderer = false;
	}, false);
	container.addEventListener('dblclick', function() {
	    popupMenu.cancel();
	    if (selectionManager.size() == 1) {
		var id = selectionManager.getSelected()[0];

		$('#' + id + ' > tbody > tr:nth-child(1)').addClass('selected');
		treeView.edit(id);
	    }
	    
	});

	window.addEventListener('resize', onWindowResize, false);
	
    }


    function onMouseDown(event) {
	event.preventDefault();

	that.triggerMouseDownOnSceneObjectViews(event);

	popupMenu.onMouseDown(event);

	mouseOnDown = {};
	mouseOnDown.x = event.clientX;
	mouseOnDown.y = event.clientY;
        lastMousePos = mouseOnDown;

        state = undefined;
	container.addEventListener('mouseup', onMouseUp, false);

	var cursoidName;
	var activeConstructor = SS.constructors.active;
	if (activeConstructor) {
	    var anchorName = activeConstructor.getAnchor(scene, camera, event);
	    if (anchorName) {
		var initialCursoid = activeConstructor.activateAnchor(anchorName);
		cursoidName = initialCursoid;
	    }
	}
	
	if (!cursoidName) {
	    cursoidName = cursoid.getCursoid(scene, camera, event)
	}
        if (cursoidName) {
            state = {cursoid: cursoidName};
            cursoid.activate(cursoidName);
	    popupMenu.cancel();
        } 

    }
    
    function onMouseMove(event) {

	that.triggerMouseOverSceneObjectViews(event);

        var mouse = {};
	mouse.x = event.clientX;
	mouse.y = event.clientY;

	if (mouseOnDown) {

            var panRotateThreshold = 10;
            var transformerThreshold = 5;
	    
	    if (!state && !popupMenu.isShowing()) {
                
                var overPanRotateThreshold = ((Math.abs(event.clientX - mouseOnDown.x) > panRotateThreshold)
			                      ||
			                      (Math.abs(event.clientY - mouseOnDown.y) > panRotateThreshold));
                
		if (!state && (event.button === 0 && event.shiftKey) && overPanRotateThreshold) {
                    state = 'rotating';
		} 
		if (!state && (event.button === 1 || event.shiftKey) && overPanRotateThreshold)  {
                    state = 'panning';
		}
	    }
	    
	    if (state) {
		popupMenu.cancel()
	    } 

            if (state === 'rotating') {
		
		var zoomDamp = Math.sqrt(distance)/10;

		target.azimuth = targetOnDown.azimuth - (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
		target.elevation = targetOnDown.elevation - (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

		target.elevation = target.elevation > Math.PI ? Math.PI : target.elevation;
		target.elevation = target.elevation < 0 ? 0 : target.elevation;

	    } else if (state === 'panning') {
                
                var dMouse = {x: mouse.x - lastMousePos.x,
                              y: mouse.y - lastMousePos.y};
                
                var camVec = camera.position.clone().negate().normalize();
                var upVec = new THREE.Vector3(0,0,1);
                var mouseLeftVec = new THREE.Vector3().cross(upVec, camVec);
                var mouseUpVec = new THREE.Vector3().cross(camVec, mouseLeftVec);
                
                var dPos = mouseLeftVec.clone().multiplyScalar(dMouse.x).addSelf(mouseUpVec.clone().multiplyScalar(dMouse.y));
                var factor = Math.sqrt(distance)/50;
                dPos.multiplyScalar(factor);

                targetScenePosition.addSelf(dPos);
            }
            
	} 


        if (cursoid.getCursoid(scene, camera, event) ||
	    (SS.constructors.active &&  
	     SS.constructors.active.getAnchor(scene, camera, event))) {
            document.body.style.cursor = 'pointer';
        } else if (SS.transformerManager && SS.transformerManager.cursor) {
            document.body.style.cursor = SS.transformerManager.cursor;
        } else {
            document.body.style.cursor = 'default';
        }

	var positionOnWorkplane = determinePositionOnWorkplane(event);
	workplane.updateXYLocation(positionOnWorkplane, event);

	var origin = new THREE.Vector3(0, 0, 0);
	var direction = new THREE.Vector3(0, 0, 1);
	var ray = new THREE.Ray(origin, direction);
	var positionOnVertical = that.determinePositionOnRay(event, ray);
        if (positionOnVertical) {
            workplane.updateZLocation(positionOnVertical, event);
        }

        lastMousePos = mouse;
    }

    function determinePositionOnWorkplane(event) {
	var planeGeometry = new THREE.PlaneGeometry(1000, 1000);
	var planeMesh = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ color: 0x080808, opacity: 0 }));
	planeMesh.doubleSided = true;
	return determinePositionOnPlane(event, planeMesh);
    }

    function determinePositionOnPlane(event, planeMesh) {
	
	var mouse = {};
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
	    
	var vector = new THREE.Vector3( mouse.x, mouse.y, 0.5 );
	var projector = new THREE.Projector();
	var mouse3D = projector.unprojectVector(vector, camera);
	var ray = new THREE.Ray(camera.position, null);
	ray.direction = mouse3D.subSelf(camera.position).normalize();

	var intersects = ray.intersectObject(planeMesh);
	if (intersects.length == 1) {
	    return {x: Math.round(intersects[0].point.x), 
                    y: Math.round(intersects[0].point.y),
                    z: Math.round(intersects[0].point.z)};
	} else {
	    return null;
	}

    }

    function determinePositionOnRay(event, givenRay) {
	var mouse = {};
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
	    
	var vector = new THREE.Vector3( mouse.x, mouse.y, 0.5 );
	var projector = new THREE.Projector();
	var mouse3D = projector.unprojectVector(vector, camera);
	var mouseRay = new THREE.Ray(camera.position, null);
	mouseRay.direction = mouse3D.subSelf(camera.position).normalize();

	var planeGeometry = new THREE.PlaneGeometry(1000, 1000);
	var planeMesh = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ color: 0x080808, opacity: 0 }));

	var intersects = mouseRay.intersectObject(planeMesh);
	if (intersects.length == 1) {
	    mouseRay.origin = intersects[0].point.clone();
	} else {
	    return null;
	}

	// http://softsurfer.com/Archive/algorithm_0106/algorithm_0106.htm
	var u = givenRay.direction.clone().normalize();
	var v = mouseRay.direction.clone().normalize();

	var w0 = new THREE.Vector3().sub(givenRay.origin.clone(), mouseRay.origin.clone());

	var a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w0), e = v.dot(w0);
	
	var sc = (b*e - c*d)/(a*c - b*b);
	var tc = (a*e - b*d)/(a*c - b*b);
	
	return  new THREE.Vector3().add(givenRay.origin, u.clone().multiplyScalar(sc));
    }

    function selectObject(event) {
	
        var found = SS.selectInScene(scene, camera, event);
        var foundGeomNodes = found.filter(function(obj) {
            return obj.object.name.geomNodeId;
        });

	if (foundGeomNodes.length > 0) {
	    if (event.shiftKey) {
		selectionManager.shiftPick(foundGeomNodes[0].object.name.geomNodeId);
	    } else {
		selectionManager.pick(foundGeomNodes[0].object.name.geomNodeId);
	    }
	} else {
	    selectionManager.deselectAll();
	}
    }

    function onMouseUp(event) {

        that.triggerMouseUpOnSceneObjectViews(event);

	targetOnDown.azimuth = target.azimuth;
	targetOnDown.elevation = target.elevation;

	var positionOnWorkplane = determinePositionOnWorkplane(event);
	if (positionOnWorkplane) {
	    workplane.clicked(positionOnWorkplane);
	}

	if ((SS.UI_STATE.state === SS.UIStates.UNDEFINED) &&
            (!state) &&
            (event.button == 0)) {
	    selectObject(event);
	}

	state = undefined;
        cursoid.deactivate();
	//SS.constructors.active && SS.constructors.active.deactivateAnchor();
	popupMenu.onMouseUp(event);

	mouseOnDown = null;
	container.removeEventListener('mouseup', onMouseUp, false);
    }

    function onMouseOut(event) {
	mouseOnDown = null;
	container.removeEventListener('mouseup', onMouseUp, false);
    }

    function onMouseWheel(event) {
        var factor = 0.01;
	event.preventDefault();
	if (overRenderer) {
	    if (event.wheelDeltaY) {
		zoom(event.wheelDeltaY * Math.sqrt(distance)*factor);
	    }
	    if (event.detail) {
		zoom(-event.detail*60 * Math.sqrt(distance)*factor);
	    }
	}
	return false;
    }

    function onDocumentKeyDown(event) {
        var factor = 10;
	if (overRenderer) {
	    switch (event.keyCode) {
	    case 187:
	    case 107:
		zoom(Math.sqrt(distance)*factor);
		event.preventDefault();
		break;
	    case 189:
	    case 109:
		zoom(-Math.sqrt(distance)*factor);
		event.preventDefault();
		break;
	    }
	}
	return false;
    }

    function onDocumentKeyUp(event) {
        if ((event.keyIdentifier === 'Shift') &&
            (state === 'rotating')) {
            state = undefined;
            
        }
        return false;
    }

    function onWindowResize(event) {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function zoom(delta) {
	distanceTarget -= delta;
    }

    function animate() {
	requestAnimationFrame(animate);
	render();
    }

    function render() {

	zoom(0);

	azimuth += (target.azimuth - azimuth) * 0.2;
	elevation += (target.elevation - elevation) * 0.3;

	var dDistance = (distanceTarget - distance) * 0.3;

	if (distance + dDistance > 1000) {
	    distanceTarget = 1000;
	    distance = 1000;
	} else if (distance + dDistance < 3) {
	    distanceTarget = 3;
	    distance = 3;
	} else {
	    distance += dDistance;
	}

        scene.position.addSelf(new THREE.Vector3().sub(targetScenePosition, scene.position).multiplyScalar(0.2));

	camera.position.x = distance * Math.sin(elevation) * Math.cos(azimuth);
	camera.position.y = distance * Math.sin(elevation) * Math.sin(azimuth);
	camera.position.z = distance * Math.cos(elevation);
        camera.position.addSelf(scene.position);

        camera.lookAt(scene.position);
	renderer.render(scene, camera);
    }
    
    function addLights() {

	pointLight = new THREE.PointLight( 0x999999 );
	pointLight.position.set(0, 0, 100);
        scene.add(pointLight);

        pointLight = new THREE.PointLight( 0x999999 );
	pointLight.position.set(0, 0, -100);
        scene.add(pointLight);


    }

    this.geomDocUpdated = function(event) {

        if (event.add) {
            add(event.add);
        }

        if (event.remove) {
            remove(event.remove);
        }

        if (event.replace) {
            remove(event.replace.original);
            add(event.replace.replacement);
        }
    }

    var add = function(geomNode) {
        SS.renderGeometry(geomNode);
    }

    var remove = function(geomNode) {
        SS.hideGeometry(geomNode);
    }

    this.selectionUpdated = function(event) {
        if (event.deselected) {
            for (var i in event.deselected) {
                var id = event.deselected[i];
                SS.unhighlightGeometry(geom_doc.findById(id))
            }
        }
        if (event.selected) {
            for (var i in event.selected) {
                var id = event.selected[i];
                SS.highlightGeometry(geom_doc.findById(id));
            }
        }
    }

    var sceneObjectViews = [];
    var mouseOverSceneObjectViews = [];
    var mouseDownSceneObjectViews = [];

    this.replaceSceneObjectViewInMouseState = function(oldView, newView) {
        [mouseOverSceneObjectViews, mouseDownSceneObjectViews].map(function(array) {
            if (array.indexOf(oldView) !== -1) {
                array.splice(mouseOverSceneObjectViews.indexOf(oldView), 1);
                array.push(newView);
            }
        });
    }

    this.registerSceneObjectView = function(sceneObjectView) {
	sceneObjectViews.push(sceneObjectView);
    }

    this.deregisterSceneObjectView = function(sceneObjectView) {
        var index1 = sceneObjectViews.indexOf(sceneObjectView);
        if (index1 !== -1) {
	    sceneObjectViews.splice(index1, 1);
        }
        var index2 = mouseOverSceneObjectViews.indexOf(sceneObjectView);
        if (index2 !== -1) {
	    mouseOverSceneObjectViews.splice(index2, 1);
        }
    }

    var findSceneObjectViewsForEvent = function(event) {
	
	var found = SS.selectInScene(scene, camera, event);
	var objects = _.pluck(found, 'object');

	// Select the hightest-level THREE.Object3D objects in the scene
	var getRoot = function(object) {
	    return object.parent.constructor === THREE.Scene ? 
		object : 
		getRoot(object.parent);
	}

	var foundSceneObjectViews = [];
	objects.map(getRoot).map(function(object) {
	    sceneObjectViews.map(function(sceneObjectView) {
		if (getRoot(object) === sceneObjectView.sceneObject) {
                    if (foundSceneObjectViews.indexOf(sceneObjectView) === -1) {
		        foundSceneObjectViews.push(sceneObjectView);
                    }
		}
	    });
	});
	return foundSceneObjectViews;
	    
    }

    this.triggerMouseOverSceneObjectViews = function(event) {
	var previousOverObjects = mouseOverSceneObjectViews.map(function(x) { return x; });
        var leaveObjects = mouseOverSceneObjectViews.map(function(x) { return x; });
        mouseOverSceneObjectViews = [];
	findSceneObjectViewsForEvent(event).map(function(sceneObjectView) {
            if (previousOverObjects.indexOf(sceneObjectView) === -1) {
		sceneObjectView.trigger('mouseEnter', event);
	    }
	    mouseOverSceneObjectViews.push(sceneObjectView);
            var index = leaveObjects.indexOf(sceneObjectView);
            if (index !== -1) {
	        leaveObjects.splice(index, 1);
            }
	});
	leaveObjects.map(function(sceneObjectView) {
	    sceneObjectView.trigger('mouseLeave', event);
	});

        if ((event.button === 0) &&
            (event.ctrlKey || !event.shiftKey)) {
            mouseDownSceneObjectViews.map(function(sceneObjectView) {
                sceneObjectView.trigger('mouseDrag', event);
	    });
        }

    }

    this.triggerMouseDownOnSceneObjectViews = function(event) {
        mouseDownSceneObjectViews = findSceneObjectViewsForEvent(event);
        mouseDownSceneObjectViews.map(function(sceneObjectView) {
            sceneObjectView.trigger('mouseDown', event);
        });
    }

    this.triggerMouseUpOnSceneObjectViews = function(event) {
        findSceneObjectViewsForEvent(event).map(function(sceneObjectView) {
            sceneObjectView.trigger('mouseUp', event);
        });
        mouseDownSceneObjectViews = [];
    }

    init();
    this.animate = animate;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.workplane = workplane;
    this.cursoid = cursoid;
    this.determinePositionOnRay = determinePositionOnRay;
    this.determinePositionOnPlane = determinePositionOnPlane;
    this.determinePositionOnWorkplane = determinePositionOnWorkplane;
    this.popupMenu = popupMenu;
    this.onMouseUp = onMouseUp;

    return this;
}
