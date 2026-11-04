// Unit-cube volume, meshed with pure linear tetrahedra.
//
// Used only to generate synthetic parser/adjacency benchmark meshes (not a
// real CFD case, no boundary layers). Element count is controlled from the
// gmsh command line via -clmax (characteristic length max); smaller values
// give more, smaller tets.
//
// Example:
//   gmsh bench-cube.geo -3 -format msh41 -clmax 0.075 -o bench-100k.msh
//   gmsh bench-cube.geo -3 -format msh41 -clmax 0.0335 -o bench-1m.msh
//
// See meshes/README.md for the benchmark harness that consumes these files.

SetFactory("OpenCASCADE");
Box(1) = {0, 0, 0, 1, 1, 1};

Mesh.Algorithm3D = 1; // Delaunay
Physical Volume("domain") = {1};
