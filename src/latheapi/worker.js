importScripts('/lib/require.js');

var worker = self;

requirejs.config({
  baseUrl: "..",
  paths: {
    'underscore': '../node_modules/underscore/underscore',
    'backbone-events': '../node_modules/backbone-events/lib/backbone-events',
    'backbone': '../node_modules/backbone/backbone',
    'lathe': '../node_modules/lathe/lib',
    'gl-matrix': '../node_modules/lathe/node_modules/gl-matrix/dist/gl-matrix',
  },
  shim: {
    'underscore': {
      exports: '_'
    },
    'backbone': {
      deps: ['underscore', 'jquery'],
      exports: 'Backbone'
    },
  },
});
requirejs([
    'lathe/bsp',
    'lathe/primitives/cube',
    'lathe/primitives/sphere',
    'lathe/primitives/subtract3d',
    'lathe/conv',
  ],
  function(BSP, Cube, Sphere, Subtract3D, Conv) {

    var infoHandler = function(a,b,c,d) {
      postMessage({info: [a,b,c,d].join('')});
    }
    
    var errorHandler = function(a,b,c,d) {
      postMessage({error: [a,b,c,d].join('')});
    }

    var returnResult = function(id, sha, bsp) {
      if (!bsp) {
        postMessage({error: 'no BSP for ' + id});
        return;
      }

      var brep = Conv.bspToBrep(bsp);
      var polygons = brep.map(function(p) {
        return p.toVertices().map(function(v) {
          return v.toCoordinate();
        });
      });
      var jobResult = {
        id: id,
        sha: sha,
        bsp: BSP.serialize(bsp),
        polygons: polygons,
      }
      postMessage(jobResult);
      
    }

    var applyTransforms = function(bsp, transforms, workplane) {
      if (transforms.translation) {
        bsp = bsp.translate(transforms.translation.x, transforms.translation.y, transforms.translation.z);
      }
      if (transforms.rotation.angle !== 0) {
       bsp = bsp.translate(-transforms.rotation.origin.x, -transforms.rotation.origin.y, -transforms.rotation.origin.z); 
       bsp = bsp.rotate(transforms.rotation.axis.x, transforms.rotation.axis.y, transforms.rotation.axis.z, transforms.rotation.angle/180*Math.PI);
       bsp = bsp.translate(transforms.rotation.origin.x, transforms.rotation.origin.y, transforms.rotation.origin.z); 
      }
      if (transforms.scale.factor !== 1) {
        bsp = bsp.translate(-transforms.scale.origin.x, -transforms.scale.origin.y, -transforms.scale.origin.z); 
        bsp = bsp.scale(transforms.scale.factor);
        bsp = bsp.translate(transforms.scale.origin.x, transforms.scale.origin.y, -transforms.scale.origin.z); 
      }
      // All primitives have a workplane, but booleans do not.
      if (workplane) {
        bsp = bsp.rotate(
          workplane.axis.x, 
          workplane.axis.y, 
          workplane.axis.z, 
          workplane.angle/180*Math.PI);
        bsp = bsp.translate(workplane.origin.x, workplane.origin.y, workplane.origin.z); 
      }
      return bsp;
    }

    this.addEventListener('message', function(e) {

      // Create new with the arguments
      if (e.data.sphere) {
        var bsp = applyTransforms(new Sphere(e.data.sphere).bsp, e.data.transforms, e.data.workplane);
        returnResult(e.data.id, e.data.sha, bsp);
      } else if (e.data.cube) {
        var bsp = applyTransforms(new Cube(e.data.cube).bsp, e.data.transforms, e.data.workplane);
        returnResult(e.data.id, e.data.sha, bsp);
      } else if (e.data.subtract) {

        // The child BSPs start off as an array of SHAs, 
        // and each SHA is replaced with the BSP from the DB
        var childBSPs = e.data.subtract;
        
        var remaining = childBSPs.length;

        var a = BSP.deserialize(childBSPs[0]);
        var b = BSP.deserialize(childBSPs[1]);
        var subtract = new Subtract3D(a,b);
        var bsp = applyTransforms(subtract.bsp, e.data.transforms || {});

        returnResult(e.data.id, e.data.sha, bsp);

      } else {
        postMessage({error: 'unknown worker message:' + JSON.stringify(e.data)});
      }

    }, false);

    postMessage('initialized');
  }
);