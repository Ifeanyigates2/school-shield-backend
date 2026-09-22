import { buildSeed } from "./seed";
import { writeDatabase } from "./store";

writeDatabase(buildSeed());
console.log("SchoolShield mobile database reset.");
