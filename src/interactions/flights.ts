import { SimulatedFlight } from '../types';

export const INITIAL_FLIGHTS: SimulatedFlight[] = [
  {
    id: '6E-2432',
    airline: 'IndiGo',
    altitude: 3500, // meters
    speed: 280, // knots
    heading: 135, // degrees
    origin: 'DEL',
    destination: 'LKO',
    x: -8000,
    z: -8000,
    progress: 0
  },
  {
    id: 'AI-431',
    airline: 'Air India',
    altitude: 9800,
    speed: 450,
    heading: 80,
    origin: 'BOM',
    destination: 'CCU',
    x: -25000,
    z: -3000,
    progress: 0.1
  },
  {
    id: 'QP-1102',
    airline: 'Akasa Air',
    altitude: 1500,
    speed: 250,
    heading: 120,
    origin: 'LKO',
    destination: 'BLR',
    x: -9987,
    z: 9769,
    progress: 0.05
  },
  {
    id: 'SG-332',
    airline: 'SpiceJet',
    altitude: 10500,
    speed: 430,
    heading: 95,
    origin: 'DEL',
    destination: 'PAT',
    x: -20000,
    z: -12000,
    progress: 0.2
  }
];

export function updateSimulatedFlights(flights: SimulatedFlight[], deltaTimeSeconds: number): SimulatedFlight[] {
  return flights.map(flight => {
    let progress = flight.progress + (deltaTimeSeconds * 0.005); // slow movement
    if (progress > 1.0) progress = 0;

    let x = flight.x;
    let z = flight.z;
    let altitude = flight.altitude;

    // Simulate paths
    if (flight.id === '6E-2432') {
      // Landing path at Amausi (DEL to LKO)
      // Path from DEL (-15000, -15000) to Amausi Airport (-9987, 9769)
      const startX = -18000;
      const startZ = -15000;
      const endX = -9987;
      const endZ = 9769;
      x = startX + (endX - startX) * progress;
      z = startZ + (endZ - startZ) * progress;
      // descend from 4000m to 150m (landing)
      altitude = Math.max(150, 4000 - (4000 - 150) * progress);
    } else if (flight.id === 'AI-431') {
      // High altitude transit BOM to CCU (west to east crossing)
      const startX = -30000;
      const startZ = 4000;
      const endX = 30000;
      const endZ = -3000;
      x = startX + (endX - startX) * progress;
      z = startZ + (endZ - startZ) * progress;
    } else if (flight.id === 'QP-1102') {
      // Takeoff from Amausi LKO to BLR (flying southeast)
      const startX = -9987;
      const startZ = 9769;
      const endX = 25000;
      const endZ = 20000;
      x = startX + (endX - startX) * progress;
      z = startZ + (endZ - startZ) * progress;
      // climb from 100m to 8500m
      altitude = Math.min(8500, 100 + (8500 - 100) * progress);
    } else if (flight.id === 'SG-332') {
      // Cruise northwest to southeast
      const startX = -30000;
      const startZ = -12000;
      const endX = 30000;
      const endZ = -8000;
      x = startX + (endX - startX) * progress;
      z = startZ + (endZ - startZ) * progress;
    }

    return {
      ...flight,
      progress,
      x,
      z,
      altitude
    };
  });
}
