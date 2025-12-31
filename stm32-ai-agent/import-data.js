const fs = require('fs');

const pins = JSON.parse(fs.readFileSync('pins.json', 'utf8'));
const knowledge = JSON.parse(fs.readFileSync('knowledge.json', 'utf8'));

console.log("-- PINS DATA");
pins.pins.forEach(pin => {
  const five_tolerant = pin.fiveTolerant ? 1 : 0;
  const functions = JSON.stringify(pin.functions || []).replace(/'/g, "''");
  const notes = (pin.notes || pin.description || "").replace(/'/g, "''");
  const reset_state = (pin.resetState || "").replace(/'/g, "''");
  const port = pin.port || "";
  const num = pin.number !== undefined ? pin.number : "NULL";
  
  console.log("INSERT INTO pins VALUES ('" + pin.pin + "', '" + port + "', " + num + ", " + pin.lqfp48 + ", '" + pin.type + "', " + five_tolerant + ", '" + reset_state + "', '" + functions + "', '" + notes + "');");
});

console.log("\n-- KNOWLEDGE DATA");
knowledge.chunks.forEach(chunk => {
  const keywords = JSON.stringify(chunk.keywords).replace(/'/g, "''");
  const content = chunk.content.replace(/'/g, "''");
  
  console.log("INSERT INTO knowledge VALUES ('" + chunk.id + "', '" + chunk.topic + "', '" + keywords + "', '" + content + "');");
});