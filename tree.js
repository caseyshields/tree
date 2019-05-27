
// do we have to list all links, or
// consider how to embed components or use glyphs...

/** Creates a network diagram that has some underlying hierarchical structure.
 * @param {number} [args.base_radius=20] : radius of node plot in pixels
 * @param {boolean} [args.cluster=false] : whether a cluster layout should be used which groups all leaves at the same level
 */
function Tree( svg, args, nodes, edges ) {

    // initialize component parameters
    let params = {
        base_radius : 20,
        cluster : false,
        size : [300, 800]
    }
    params = Object.assign( params, args );

    // the root node of the d3 hierarchy to be drawn
    let root = d3.stratify()
        .id( function(d) {return d.id;} )
        .parentId(function(d) {return d.parent;} )
        ( nodes );

    // a buffer holding traffic which will be drawn over the links
    let traffic = [];
    
    // add groups for the different components of the diagram
    let group = svg.append('g')
        .attr('pointer-events', 'all')
        .attr( 'class', 'tree' );
    let links = group.append('g')
        .attr('class', 'links')
        .selectAll('.edges');
    let verts = group.append('g')
        .attr('class', 'nodes')
        .selectAll('.nodes');
    let messages = group.append('g')
        .attr( 'class', 'messaging' )
        .selectAll( 'path' );

    // edge path generator
    let path = d3.linkHorizontal()
        .x( function(d) {return d.y;} )
        .y( function(d) {return d.x;} );
    
    // declare the D3 tree layout. // TODO add a switch for horizontal or vertical trees
    let layout;
    if (params.cluster)
        layout = d3.cluster().nodeSize( [2*params.base_radius, 2*params.base_radius] );
    else
        layout = d3.tree();
    layout
        .separation( function(a,b) { return 1; } )
        .size( params.size );
    layout(root);

    /** The default function triggers a full render of the diagram */
    function tree() {
        tree.drawLinks();
        tree.drawTraffic();
        tree.drawNodes();
    }

    /** Getter for the D3 hierarchy underlying the tree diagram. */
    tree.hierarchy = function( ) {
        return root;
    }

    /** accessor/mutator to the click handler. */
    tree.click = function( callback ) {
        clicked = callback;
        verts.on('click', clicked);
        return tree;
    } // TODO should we have a click handler for the links?

    // the default handler simply logs the selected node
    let clicked = function( node, index, selection ) {
        console.log( node );
    }
    tree.click(clicked);

    /** D3 style sgetter for lambda which accepts D3 link as an argument and returns the area it 
     * should have relative to the source node */
    tree.linkArea = function( f ) {
        if (f==undefined)
            return linkArea;
        linkArea = f;
        return tree;
    }
    // a function that returns a ratio between the link area and the source node area
    let linkArea = function(link) { return 0; }

    /** Adds the given message to the message buffer */
    tree.addMessage = function(message) {
        traffic.push(message);
    }

    /** Clears all buffered traffic */
    tree.expireMessages = function( expiration ) {
        while (traffic.length>0 && traffic[0].time < expiration)
            traffic.shift();
    } // TODO we could make this a bit more efficient...

    /** Clear all message traffic from the buffer. */
    tree.clearMessages = function() {
        while (traffic.length)
            traffic.pop();
    }

    /** D3 style sgetter for the message buffer */
    tree.messages = function( array ) {
        if (array) {
            traffic = array
            return tree;
        }
        return traffic;
    }

    /** Updates the SVG of the parent links between tree nodes. */
    tree.XdrawLinks = function() {
        links = links.data( root.links() );
        links = links.enter()
            .append( 'path' )
            .attr( 'class', 'edge' )

        // update the edge with the simulation coordinates
        .merge( links )
            .each( function(d) {
                if (!d.target)
                    return;
                let nodeArea = Math.PI * params.base_radius * params.base_radius;
                let area = nodeArea * linkArea(d); // (d.target.count / params.max_messages);
                let path = linkPath(d.target, 20, 20, area);
                d3.select(this)
                    .attr('d', path);
                    //.attr('class', d.class) // TODO do we need to dynamically change styling of links?
            } );
    }
    tree.drawLinks = function() {
        links = links.data( root.links() );//edges );
        links = links.enter()
            .append( 'path' )
            .attr( 'class', 'edge' )
        
        .merge( links )
            .attr( 'd', path );//(link)=>{console.log(link); path(link);} );
    }

    /** Updates the SVG of the hierarchical network's vertices using a D3 tree Layout*/
    tree.drawNodes = function() {
        verts = verts.data( root.descendants() );
        let entered = verts.enter()
            .append( 'g' )
            .on( 'click', clicked )
            .attr( 'class', function(d) {return 'node '+d.data.class;} );

        entered.append( 'circle' )
            .attr( 'r', params.base_radius );

        entered.append( 'text' )
            // .attr('size', '20px') // prob should be in the stylesheet
            .text( function(d) {return d.id;} );

        // use CSS transform attribute to move the entire SVG group element
        verts = entered.merge( verts )
            .attr('transform', function(d) {return 'translate('+d.y+', '+d.x+')';} );
    }

    /** Updates the SVG of the pictured message traffic */
    tree.drawTraffic = function() {
        messages = messages.data( traffic );
        messages = messages.enter()
                .append( 'path' )
            .merge( messages )
                .each( function(d) {
                    let path = messagePath(d, 
                        Math.random()*Math.PI/2.0, 20,
                        Math.random()*Math.PI/2.0, 20);
                    d3.select(this)
                        .attr('class', d.class)
                        .attr('d', path);
                } );
    }

    /** draws a parent link in a tree diagram with a prescribed area constructed symmetrically from two parabolas
     * @param d - the d3 tree node whose parent link will be drawn
     * @param Sr - the radius of the source node, this is needed so the link kisses the edge of the node
     * @param Tr - the radius of the target parent node
     * @param area - the desired area of the link in pixels
    */
    function linkPath(d, Sr, Tr, area) {
        // find the slope
        let S = d; // d.source;
        let T = d.parent; // d.target;
        let dx = T.x - S.x;
        let dy = T.y - S.y;

        // construct unit basis vectors parallel and perpendicular to edge
        let h = Math.sqrt( dx*dx + dy*dy );
        let u = dx/h;
        let v = dy/h;

        // find where the source node's circle intersects that line
        let Sx = S.x + Sr * u;
        let Sy = S.y + Sr * v;

        // find where the target node's circle intersects that line
        let Tx = T.x - Tr * u;
        let Ty = T.y - Tr * v;

        // find midpoint of edge
        let mx = (Sx + Tx) / 2;
        let my = (Sy + Ty) / 2;

        // solve paraboloid width for the given area using calculus
        dx = Tx - Sx;
        dy = Ty - Sy;
        let k = Math.sqrt( dx*dx + dy*dy );
        let w = (3*area)/(8*k)

        // find first control point
        let x1 = mx + (v * 2 * w);
        let y1 = my - (u * 2 * w);
        // geomerically, the parabola's apex is half the perpendicular height so double the user value

        // find other control point
        let x2 = mx - (v * 2 * w);
        let y2 = my + (u * 2 * w);

        // shove it all into a template string.
        return `M${Sy} ${Sx} Q${y1} ${x1}, ${Ty} ${Tx} Q${y2} ${x2}, ${Sy} ${Sx} Z`;

        // DEBUG by drawing the control points
        //return `M ${Sy} ${Sx} L ${y1} ${x1} L ${Ty} ${Tx} L ${y2} ${x2} Z`;
    }

    /** Draw a cubic bezier between two arbitrary points on the edge of nodes.
     * @param d The message will be drawn over the parent link of this node
     * @param Sa The angle the edge exits the origin node
     * @param Sr The radius of origin node
     * @param Ta The angle the edge enters the target node
     * @param Tr The radius of the target node
     */
    function messagePath(d, Sa, Sr, Ta, Tr) {
        
        // find the slope
        let S = d.source;
        let T = d.target;
        let dx = T.x - S.x;
        let dy = T.y - S.y;

        // construct unit basis vectors parallel and perpendicular to edge
        let h = Math.sqrt( dx*dx + dy*dy );
        let u = dy/h;
        let v = dx/h;

        // determine the angle the edge exits the source relative the edge
        // let ang = Sa;//S.out * Math.PI / S.outMax / 2.0;
        let sina = Math.sin(Sa);
        let cosa = Math.cos(Sa);
        // TODO max offset from edge is 90 degrees, should we just increment S.outMax if we surpass that?

        // construct a vector from the source center to a point the appropriate angle from the edge
        let a = [ -Sr * (u*sina - v*cosa), 
            Sr * (u*cosa + v*sina) ];

        // determine the angle the edge enters the target node
        // ang = Ta;//T.in * Math.PI / T.inMax / 2.0;
        sina = Math.sin(-Ta);
        cosa = Math.cos(-Ta);

        // construct a vector from the target center to a point on a circle, angled away by the current capacity...
        let b = [ Tr * (u*sina - v*cosa), 
            -Tr * (u*cosa + v*sina) ];
        
        // construct the first point on a line tangent to the line between the nodes
        let p0x = S.x + a[0];
        let p0y = S.y + a[1];
        
        // construct the next point another radius out from that point
        let p1x = S.x + 2*a[0];
        let p1y = S.y + 2*a[1];
        
        // make a similar construction on the ohter node, starting with the larger radius
        let p2x = T.x + 2*b[0];
        let p2y = T.y + 2*b[1];
        let p3x = T.x + b[0];
        let p3y = T.y + b[1];
        
        // shove it all into a template string.
        // return `M${p0x} ${p0y} C ${p1x} ${p1y}, ${p2x} ${p2y}, ${p3x} ${p3y}`; // reflection
        return `M${p0y} ${p0x} C ${p1y} ${p1x}, ${p2y} ${p2x}, ${p3y} ${p3x}`;

        // DEBUG by drawing the control points
        //return `M${p0y} ${p0x} L ${p1y} ${p1x} L ${p2y} ${p2x} L ${p3y} ${p3x}`;
    }

    return tree;
}

// TODO I need to resize the layout every time the window changes size..
// That or use the zoom in the same way it is used for the map...

// TODO We might also need to handle some general graphs as well,
// which means we might need to draw extra edges on top of the tree layout.