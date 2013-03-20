define([
        'jquery',
        'lib/jquery.mustache',
        'src/calculations',
        'src/worldcursor',
        'src/scene',
        'src/geometrygraphsingleton',
        'src/modelviews/geomvertexMV', 
        'src/pointMV', 
        'src/heightanchorview',
        'src/asyncAPI',
        'src/lathe/adapter',
        'src/lathe/normalize',
        'requirejsplugins/text!/ui/images/icons/cube.svg',
    ], 
    function(
        $, __$,
        calc,
        worldCursor,
        sceneModel,
        geometryGraph,
        GeomVertexMV,
        PointMV,
        EditingHeightAnchor,
        AsyncAPI,
        latheAdapter,
        Normalize,
        icon) {

    // ---------- Common ----------

    var SceneViewMixin = {

        render: function() {
            GeomVertexMV.SceneView.prototype.render.call(this);

            var points = geometryGraph.childrenOf(this.model.vertex);
            if (points.length !== 2) {
                return;
            }

            var materials;
            if (this.model.vertex.editing) {
                materials = [
                    this.materials.editing.face, 
                    this.materials.editing.wire
                ]
            } else {
                materials = [
                    this.materials.normal.face, 
                    this.materials.normal.wire
                ]
            }

            var dimensions = Normalize.normalizeVertex(this.model.vertex);
            var position = new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z);

            var cube = THREE.SceneUtils.createMultiMaterialObject(
                new THREE.CubeGeometry(dimensions.w, dimensions.d, dimensions.h),
                materials);
            cube.position = position.add(new THREE.Vector3(
                dimensions.w/2, dimensions.d/2, dimensions.h/2));
            this.sceneObject.add(cube);
        },

    }

    // ---------- Editing ----------

    var EditingModel = GeomVertexMV.EditingModel.extend({

        initialize: function(options) {
            this.displayModelConstructor = DisplayModel;
            GeomVertexMV.EditingModel.prototype.initialize.call(this, options);

            var points = geometryGraph.childrenOf(this.vertex);

            

            // Create the child models
            var that = this;
            if (this.vertex.proto) {
                this.stage = 0;
                this.updateHint();
                this.activePoint = points[0];
            } else {
                this.originalImplicitChildren = geometryGraph.childrenOf(this.vertex);
                this.editingImplicitChildren = [];
                this.editingImplicitChildren = this.originalImplicitChildren.map(function(child, i) {
                    var editing = AsyncAPI.edit(child);
                    that.views.push(new EditingHeightAnchor({
                        model: that, 
                        heightKey: 'height',
                        pointVertex: editing
                    }));
                    return editing;
                })
            }

            this.setMainSceneView(new EditingSceneView({model: this}));
        },

        addTreeView: function() {
            var domView = new EditingDOMView({model: this});
            this.views.push(domView);
            return domView;
        },

        workplanePositionChanged: function(position, event) {
            if (this.vertex.proto) {
                if (this.activePoint) {
                    this.activePoint.parameters.coordinate.x = position.x;
                    this.activePoint.parameters.coordinate.y = position.y;
                    this.activePoint.parameters.coordinate.z = position.z;
                    this.activePoint.trigger('change', this.activePoint);            
                } else if (this.activeHeightAnchor) {
                    this.activeHeightAnchor.drag(position, undefined, event);
                }
            }
        },

        sceneViewClick: function(viewAndEvent) {
            if (this.vertex.proto) {
                this.workplaneClick(worldCursor.lastPosition);
            }
        },

        workplaneClick: function(position) {
            if (this.vertex.proto) {
                if (this.stage === 0) {
                    this.addPoint(position);
                    ++this.stage;
                    this.updateHint();
                } else if (this.stage === 1) {
                    ++this.stage;
                    this.activeHeightAnchor = new EditingHeightAnchor({
                        model: this, 
                        heightKey: 'height',
                        pointVertex: this.activePoint
                    });
                    this.activeHeightAnchor.dragStarted();
                    this.activeHeightAnchor.isDraggable = function() {
                        return false;
                    };
                    this.views.push(this.activeHeightAnchor);
                    delete this.activePoint;
                    this.updateHint();
                } else if (this.stage === 2) {
                    this.tryCommit();
                }
            } else {
                this.tryCommit();
            }
        },

        addPoint: function(position) {
            var point = geometryGraph.addPointToParent(this.vertex);
            this.activePoint = point;
            this.workplanePositionChanged(position);
        },

        updateHint: function() {
            if (this.vertex.proto) {
                switch(this.stage) {
                    case 0: 
                        this.hintView.set('Click to add a corner.');
                        break;
                    case 1:
                        this.hintView.set('Click to add a corner diagonally opposite.');
                        break;
                    case 2:
                        this.hintView.set('Click to set the height.');
                        break;
                }
            }
        },

        icon: icon,

    });

    var EditingDOMView = GeomVertexMV.EditingDOMView.extend({

        render: function() {
            GeomVertexMV.EditingDOMView.prototype.render.call(this);
            var template = 
                this.beforeTemplate +
                '<div>' + 
                'height <input class="field height" type="text" value="{{height}}"></input>' +
                '</div>' +
                this.afterTemplate;
                
            var view = _.extend(this.baseView, {
                height : this.model.vertex.parameters.height,
            });
            this.$el.html($.mustache(template, view));
            return this;
        },

        update: function() {
            var that = this;
            ['height'].forEach(function(key) {
                that.$el.find('.field.' + key).val(
                    that.model.vertex.parameters[key]);
            });
        },

        updateFromDOM: function() {
            var that = this;
            ['height'].forEach(function(key) {
                try {
                    var expression = that.$el.find('.field.' + key).val();
                    that.model.vertex.parameters[key] = expression;
                } catch(e) {
                    console.error(e);
                }
            });
            this.model.vertex.trigger('change', this.model.vertex);
        }

    }); 


    var EditingSceneView = GeomVertexMV.EditingSceneView.extend(SceneViewMixin).extend({

        initialize: function(options) {
            GeomVertexMV.EditingSceneView.prototype.initialize.call(this);
            this.on('dragEnded', this.dragEnded, this);
            this.on('drag', this.drag, this);
        },

        remove: function() {
            GeomVertexMV.EditingSceneView.prototype.remove.call(this);
            this.off('dragEnded', this.dragEnded, this);
            this.off('drag', this.drag, this);
        },

    });


    // ---------- Display ----------

    var DisplayModel = GeomVertexMV.DisplayModel.extend({

        initialize: function(options) {
            this.editingModelConstructor = EditingModel;
            this.displayModelConstructor = DisplayModel;
            GeomVertexMV.DisplayModel.prototype.initialize.call(this, options);
            this.sceneView = new DisplaySceneView({model: this});
            this.views.push(this.sceneView);
            this.vertex.on('change', this.updateCumulativeArea, this);
        },

        destroy: function() {
            GeomVertexMV.DisplayModel.prototype.destroy.call(this);
            this.vertex.off('change', this.updateCumulativeArea, this);
        },

        icon: icon,

    });

    var DisplaySceneView = GeomVertexMV.DisplaySceneView.extend(SceneViewMixin).extend({

        initialize: function() {
            GeomVertexMV.DisplaySceneView.prototype.initialize.call(this);
        },

        remove: function() {
            GeomVertexMV.DisplaySceneView.prototype.remove.call(this);
        },

        render: function() {
            GeomVertexMV.SceneView.prototype.render.call(this);

            var that = this;
            latheAdapter.generate(
                that.model.vertex,
                function(err, result) {

                if (err) {
                    console.error('no mesh', that.model.vertex.id);
                    return;
                }

                var toMesh = that.polygonsToMesh(result.polygons);
                var faceGeometry = toMesh.geometry;
                var meshObject = THREE.SceneUtils.createMultiMaterialObject(faceGeometry, [
                    that.materials.normal.face, 
                ]);
                that.sceneObject.add(meshObject);
                sceneModel.view.updateScene = true;
            });
        },

    })



    // ---------- Module ----------

    return {
        EditingModel: EditingModel,
        DisplayModel: DisplayModel,
    }

});