import mongoose from 'mongoose';
import { config } from './config.js';
import { Service, Counter, User, Token, CrowdEvent, Sequence } from './models.js';
import { issueToken, checkInToken, rebalance } from './queueEngine.js';

const SERVICES = [
  { name: 'City General Hospital: OPD', code: 'H', category: 'hospital', address: 'Civil Hospital Road, Ahmedabad', avgServiceMinutes: 7, capacity: 60, counters: ['OPD Desk 1', 'OPD Desk 2', 'OPD Desk 3', 'Pharmacy'], open: 3 },
  { name: 'Metro Savings Bank: Main Branch', code: 'B', category: 'bank', address: 'CG Road, Navrangpura', avgServiceMinutes: 6, capacity: 40, counters: ['Teller 1', 'Teller 2', 'Loans Desk'], open: 2 },
  { name: 'District Passport Seva Kendra', code: 'G', category: 'government', address: 'Ashram Road', avgServiceMinutes: 12, capacity: 80, counters: ['Verification 1', 'Verification 2', 'Biometrics'], open: 2 },
  { name: 'Apex Auto Service Center', code: 'S', category: 'service_center', address: 'SG Highway', avgServiceMinutes: 20, capacity: 25, counters: ['Advisor 1', 'Advisor 2'], open: 1 },
];

const NAMES = ['Aarav Shah', 'Diya Patel', 'Kabir Mehta', 'Ishita Joshi', 'Rohan Desai', 'Meera Trivedi', 'Vihaan Parmar', 'Anaya Gupta', 'Dev Solanki', 'Sara Khan', 'Nikhil Rao', 'Pooja Nair'];

async function run() {
  await mongoose.connect(config.mongoUri);
  console.log('Resetting QueueFlow collections...');
  await Promise.all([User, Service, Counter, Token, CrowdEvent, Sequence].map((m) => m.deleteMany({})));

  const created = [];
  for (const def of SERVICES) {
    const { counters, open, ...fields } = def;
    const service = await Service.create(fields);
    const docs = await Counter.insertMany(
      counters.map((name, i) => ({ service: service._id, name, status: i < open ? 'open' : 'closed' }))
    );
    created.push({ service, counters: docs });
  }

  await User.create([
    { name: 'Administrator', email: 'admin@queueflow.com', role: 'admin', passwordHash: await User.hashPassword('Admin@123') },
    { name: 'Hospital Staff', email: 'hospital@queueflow.com', role: 'staff', service: created[0].service._id, passwordHash: await User.hashPassword('Staff@123') },
    { name: 'Bank Staff', email: 'bank@queueflow.com', role: 'staff', service: created[1].service._id, passwordHash: await User.hashPassword('Staff@123') },
    { name: 'Passport Staff', email: 'passport@queueflow.com', role: 'staff', service: created[2].service._id, passwordHash: await User.hashPassword('Staff@123') },
  ]);

  // A little demo traffic so dashboards are not empty.
  let n = 0;
  for (const [idx, count] of [[0, 9], [1, 5], [2, 3]]) {
    const { service } = created[idx];
    for (let i = 0; i < count; i += 1) {
      const priority = i === 4 ? 'senior' : i === 6 ? 'accessibility' : 'normal';
      const token = await issueToken(service, { name: NAMES[n % NAMES.length], priority });
      if (i % 2 === 0) await checkInToken(token);
      n += 1;
    }
    await rebalance(service._id);
  }

  console.log('\nSeed complete. Demo logins:');
  console.log('  Admin   admin@queueflow.com     / Admin@123');
  console.log('  Staff   hospital@queueflow.com  / Staff@123');
  console.log('  Staff   bank@queueflow.com      / Staff@123');
  console.log('  Staff   passport@queueflow.com  / Staff@123\n');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
