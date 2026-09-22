import { app } from "./app";
import { config } from "./config";
import { DEMO } from "./demo";
import { sendDueReminders } from "./reminders";
import { buildSeed } from "./seed";
import { getDb, initDatabase } from "./store";

initDatabase(buildSeed);
sendDueReminders();
setInterval(sendDueReminders, 30_000);

app.listen(config.port, "0.0.0.0", () => {
  const today = getDb().authorizations.find((auth) => auth.id === "aut_today_amara");
  console.log(`SchoolShield mobile API listening on http://localhost:${config.port}`);
  if (!config.production) {
    console.log(`Parent login: ${DEMO.email} / ${DEMO.password}`);
    console.log(`Open invitation: ${DEMO.invitation}`);
    console.log(`Gate key: ${config.gateKey}`);
    if (today) console.log(`Today's Amara pickup code: ${today.code}`);
  }
});
