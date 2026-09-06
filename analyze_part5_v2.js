// analyze_part5_v2.js — robust identifier extraction with proper JS parsing.
const fs = require('fs');

const part5 = fs.readFileSync('part5.js', 'utf8');

// Use Node's built-in parser via vm.Script? No, that's complicated. Let's try
// requiring acorn — if available. If not, fall back to a careful tokenizer.

let acorn;
try { acorn = require('acorn'); } catch (e) { /* try alternatives */ }

if (acorn) {
  console.log('Using acorn.');
  const ast = acorn.parse(part5, { ecmaVersion: 2022, sourceType: 'script' });
  // Walk AST and find Identifier nodes that are *references* (not property keys
  // and not declaration names). Also build a set of declaration names per IIFE.
  function isPropAccess(node) {
    // MemberExpression .property — node is the property
    // ObjectExpression property.key — not a reference
    // MethodDefinition key — not a reference
    // Property key (when not shorthand/computed) — not a reference
    return false;
  }
  // Just use scope analysis from acorn-walk? Simpler: collect identifiers that
  // appear as callee, as assignment target (LHS), or as plain reference.
  const identifiers = new Set();
  // Build a map of "global" declarations (top-level) for IIFEs.
  // For each IIFE FunctionExpression body, find:
  //  - parameters (in the function's params)
  //  - var/let/const declarations in the body
  //  - function declarations in the body
  //  - class declarations
  // Then find Identifier references inside.

  // Use acorn-walk if available, otherwise write a manual walker.
  let walk;
  try { walk = require('acorn-walk'); } catch (e) {}

  function collectNames(scope, names) {
    for (const n of names) names.add(n.name);
  }

  if (walk) {
    // Find all IIFEs
    walk.simple(ast, {
      Identifier(node) {
        // skip property keys
        // skip declaration names — they have specific parents
        // Heuristic: skip if parent is Property and node === parent.key
        // or parent is MemberExpression and node === parent.property
        // (acorn-walk doesn't expose parent, but we can check via state)
        // For now, collect everything and filter later.
        identifiers.add(node.name);
      }
    });
  }

  console.log('Identifiers found:', identifiers.size);
  console.log([...identifiers].sort().join('\n'));
} else {
  console.log('acorn not available — using tokenizer approach.');
}