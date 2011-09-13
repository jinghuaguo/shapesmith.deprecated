function Action(label, iconPath, fn) {
    this.label = label;
    this.iconPath = iconPath;
    this.fn = fn;

    this.render = function(toolbar) {

        var imgId = "action_" + label.toLowerCase().replace(/ /g, '_');
        toolbar.append('<img id="' + imgId + '" src="' + this.iconPath + '" title="' + label + '"/>');
        
        // Because 'this' is the HTML element inside the function below,
        // we have to use a reference
        var fn = this.fn;
	var ref = '#' + imgId;
        jQuery(ref).mouseenter(function() {
	    jQuery(ref).css('background-color', '#444');
	});
        jQuery(ref).mouseleave(function() {
	    jQuery(ref).css('background-color', '');
	});
        jQuery("#" + imgId).mouseup(function() {
            fn();
        });
    }
}

function delete_geom() {
    if (selectionManager.size() == 0)  {
            alert("please select at least one object");
        return;
    }
    var selected = selectionManager.selected();
    var nodes = selected.map(function(path) {
	return geom_doc.findByPath(path);
    });
    selectionManager.deselectAll();

    var doFn = function() {
	for (var i in nodes) {
            geom_doc.remove(nodes[i]);
	}
	command_stack.inProgressSuccess();
    }

    var undoFn = function() {
	for (var i in nodes) {
            geom_doc.add(nodes[i]);
	}
	command_stack.inProgressSuccess();
    }

    var redoFn = doFn;
    var cmd = new Command(doFn, undoFn, redoFn);
    command_stack.execute(cmd);

}


function create_primitive(type, keys) {
    var geometryParams = {};
    for (var i in keys) {
        geometryParams[keys[i]] = null;
    }
    geom_doc.add(new GeomNode({
        type: type,
        editing: true,
        parameters: geometryParams}));
}

function create_transform(type, keys) {
    if (selectionManager.size() != 1)  {
        alert("no object selected!");
        return;
    }
    var transformParams = {};
    for (var i in keys) {
        transformParams[keys[i]] = null;
    }
    
    var path = selectionManager.selected()[0];
    
    var original = geom_doc.findByPath(path);
    var replacement = original.editableCopy();
    replacement.transforms.push(new Transform({
        type: type,
        editing: true,
        parameters: transformParams
    }));
    geom_doc.replace(original, replacement);
       
}


$(document).ready(function() {

    /*
     * Document
     */
    new Action("Save", "images/save.png", 
               function() { 
		   save(); 
	       }).render($("#document"));
    new Action("Undo", "images/undo.png", 
               function() { 
		   command_stack.undo(); 
	       }).render($("#document"));
    new Action("Redo", "images/redo.png", 
               function() { 
		   command_stack.redo(); 
	       }).render($("#document"));
    

    // Edit
    new Action("Delete", "images/trash.png", 
               function() { 
		   delete_geom(); 
	       }).render($("#edit"));
    new Action("Export to STL", "images/stl.png", 
               function() { 
		   var pattern = /^\/geom\/(.*)$/;
		   var id = selectionManager.selected()[0].match(pattern)[1];
		   window.location = '/stl/' + id; 
	       }).render($("#edit"));

    /*
     * Primitives
     */
    new Action("Cuboid", "/images/cuboid.png", 
               function() { create_primitive("cuboid",  ["u", "v", "w"]); }).render($("#primitives"));
    new Action("Sphere", "/images/sphere.png", 
               function() { create_primitive("sphere", ["radius"]); }).render($("#primitives"));
    new Action("Cylinder", "/images/cylinder.png", 
               function() { create_primitive("cylinder", ["radius", "height"]); }).render($("#primitives"));
    new Action("Cone", "/images/cone.png", 
               function() { create_primitive("cone", ["bottom_radius", "top_radius", "height"]); }).render($("#primitives"));
    new Action("Wedge", "/images/wedge.png", 
               function() { create_primitive("wedge", ["x1", "x2", "y", "z"]); }).render($("#primitives"));
    new Action("Torus", "/images/torus.png", 
               function() { create_primitive("torus", ["r1", "r2"]); }).render($("#primitives"));
    
    /*
     * Booleans
     */
    new Action("Union", "/images/union.png", 
               function() { boolean("union"); }).render($("#boolean"));
    new Action("Subtract", "/images/diff.png", 
               function() { boolean("subtract"); }).render($("#boolean"));
    new Action("Intersect", "/images/intersect.png", 
               function() { boolean("intersect"); }).render($("#boolean"));
    
    /*
     * Transformations
     */
    new Action("Translate", "/images/translate.png", 
               function() { create_transform("translate", ["dx", "dy", "dz"]); }).render($("#transforms"));
    new Action("Scale", "/images/scale.png", 
               function() { create_transform("scale", ["x", "y", "z", "factor"]); }).render($("#transforms"));
    new Action("Rotate", "/images/rotate.png", 
               function() { create_transform("rotate", ["px", "py", "pz", "vx", "vy", "vz", "angle"]); }).render($("#transforms"));
    new Action("Mirror", "/images/mirror.png", 
               function() { create_transform("mirror", ["px", "py", "pz", "vx", "vy", "vz"]); }).render($("#transforms"));

    /*
     * Copy & Transform
     */
    new Action("Copy", "/images/copy.png", 
               function() { 
		   copy()
	       }).render($("#copyTransforms"));
    new Action("Copy Translate", "/images/copy_translate.png", 
               function() { 
		   create_transform("copy_translate", ["dx", "dy", "dz", "n"]); 
	       }).render($("#copyTransforms"));
    new Action("Copy Rotate", "/images/copy_rotate.png", 
               function() { 
		   create_transform("copy_rotate", ["px", "py", "pz", "vx", "vy", "vz", "angle", "n"]);
	       }).render($("#copyTransforms"));
    new Action("Copy Mirror", "/images/copy_mirror.png", 
               function() { 
		   create_transform("copy_mirror", ["px", "py", "pz", "vx", "vy", "vz"]); 
	       }).render($("#copyTransforms"));


});

