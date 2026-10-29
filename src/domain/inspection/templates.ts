import type { PropertyType } from '../property';
import type { RoomType } from './types';

/**
 * Inspection templates. A template set is a versioned, jurisdiction-neutral starting point; markets
 * point at one through `Market.inspectionTemplateSet`. Changing a template never alters inspections
 * already created from it, because each inspection stores its own copy of the checklist.
 */

export interface TemplateGroup {
  key: string;
  label: string;
  items: string[];
}

const G = (key: string, label: string, items: string[]): TemplateGroup => ({ key, label, items });

const DOORS = G('doors', 'Doors', [
  'Door surface condition',
  'Door frame',
  'Door opens correctly',
  'Door closes correctly',
  'Door handle',
  'Door lock',
  'Door hinges',
  'Door stopper',
  'Visible damage',
  'Paint condition',
]);

const WINDOWS = G('windows', 'Windows', [
  'Window glass',
  'Window frames',
  'Windows open and close',
  'Window latches and locks',
  'Burglar bars',
  'Window sills',
  'Curtain rails or blinds',
]);

const WALLS = G('walls', 'Walls and ceiling', [
  'Walls',
  'Wall paint',
  'Nail holes or fixings',
  'Ceiling',
  'Cornices',
  'Skirting boards',
  'Signs of damp or mould',
]);

const FLOOR = G('floor', 'Floor', ['Floor surface', 'Carpets or floor coverings', 'Thresholds and trims']);

const ELECTRICAL = G('electrical', 'Electrical', [
  'Ceiling lights',
  'Wall lights',
  'Light switches',
  'Socket outlets',
  'Visible electrical damage',
  'Fixed appliances',
  'Other electrical fixtures',
]);

const OUTDOOR_ELECTRICAL = G('outdoor_electrical', 'Outdoor electrical', ['Outdoor lights', 'Outdoor sockets', 'Visible electrical damage']);

const KITCHEN = G('kitchen', 'Kitchen fittings', [
  'Cupboard doors',
  'Cupboard hinges',
  'Cupboard interiors',
  'Drawers and runners',
  'Countertops',
  'Splashback and tiles',
  'Sink',
  'Taps',
  'Drainage',
  'Visible leaks under sink',
  'Hob / stove top',
  'Oven',
  'Extractor hood',
  'Extractor fan',
  'Dishwasher connection',
  'Washing machine connection',
  'Fridge space and plug',
  'Pantry',
]);

const BATHROOM = G('bathroom', 'Bathroom fittings', [
  'Toilet flush',
  'Toilet seat',
  'Toilet bowl and cistern',
  'Basin',
  'Taps',
  'Shower',
  'Shower screen or curtain rail',
  'Bath',
  'Drainage',
  'Visible leaks',
  'Tiles',
  'Grouting',
  'Silicone seals',
  'Mirrors',
  'Cabinet hinges',
  'Towel rails',
  'Extractor fan',
  'Mould or water damage',
]);

const TOILET = G('toilet', 'Toilet fittings', [
  'Toilet flush',
  'Toilet seat',
  'Toilet bowl and cistern',
  'Basin',
  'Taps',
  'Visible leaks',
  'Tiles',
  'Toilet roll holder',
  'Extractor fan',
  'Mould or water damage',
]);

const BEDROOM = G('bedroom', 'Bedroom fittings', ['Built-in cupboards', 'Cupboard doors and hinges', 'Shelving', 'Hanging rails', 'Cupboard lights']);

const LIVING = G('living', 'Living area fittings', ['Built-in units', 'Fireplace', 'TV aerial or data points', 'Sliding doors']);

const DINING = G('dining', 'Dining area fittings', ['Built-in units', 'Serving hatch', 'Sliding doors']);

const ENTRANCE = G('entrance', 'Entrance', ['Security gate', 'Intercom', 'Doorbell', 'Entrance light', 'Post box', 'House number']);

const HALLWAY = G('hallway', 'Hallway', ['Linen cupboard', 'Smoke detector', 'Alarm sensors']);

const LAUNDRY = G('laundry', 'Laundry', [
  'Washing machine connection',
  'Tumble dryer vent',
  'Laundry tub',
  'Taps',
  'Drainage',
  'Visible leaks',
  'Shelving',
]);

const BALCONY = G('balcony', 'Balcony', ['Balustrade and railings', 'Floor tiles', 'Drainage', 'Sliding doors', 'Ceiling or overhang']);

const PATIO = G('patio', 'Patio', ['Paving or tiles', 'Drainage', 'Braai area', 'Covering or pergola', 'Sliding doors']);

const GARAGE = G('garage', 'Garage', [
  'Garage door',
  'Garage door motor',
  'Remote controls',
  'Garage floor',
  'Garage walls',
  'Garage lights',
  'Garage sockets',
  'Storage shelving',
  'Oil stains',
]);

const GARDEN = G('garden', 'Garden and grounds', [
  'Lawn',
  'Beds and plants',
  'Trees',
  'Irrigation',
  'Garden taps',
  'Boundary walls',
  'Fences',
  'Gates',
  'Gate motor',
  'Paving and driveway',
  'Washing line',
  'Refuse bin area',
  'Swimming pool',
  'Pool pump and equipment',
  'Pool cover or net',
]);

const STORAGE = G('storage', 'Storage room', ['Storage door', 'Storage lock', 'Shelving', 'Storage light', 'Signs of damp or mould']);

const GENERAL = G('general', 'Keys, meters and services', [
  'Keys handed over',
  'Remotes and access tags',
  'Electricity meter reading recorded',
  'Water meter reading recorded',
  'Prepaid meter units recorded',
  'Electrical distribution board',
  'Water heater / geyser',
  'Smoke detectors',
  'Alarm system',
  'Water pressure',
  'Hot water supply',
  'Pest activity',
]);

/** Which checklist groups each room type starts with. */
export const ROOM_TEMPLATES: Record<RoomType, { label: string; groups: TemplateGroup[] }> = {
  entrance: { label: 'Entrance', groups: [ENTRANCE, DOORS, WALLS, FLOOR, ELECTRICAL] },
  living: { label: 'Living room', groups: [DOORS, WINDOWS, WALLS, FLOOR, ELECTRICAL, LIVING] },
  dining: { label: 'Dining room', groups: [DOORS, WINDOWS, WALLS, FLOOR, ELECTRICAL, DINING] },
  kitchen: { label: 'Kitchen', groups: [KITCHEN, DOORS, WINDOWS, WALLS, FLOOR, ELECTRICAL] },
  bedroom: { label: 'Bedroom', groups: [DOORS, WINDOWS, WALLS, FLOOR, ELECTRICAL, BEDROOM] },
  bathroom: { label: 'Bathroom', groups: [BATHROOM, DOORS, WINDOWS, WALLS, FLOOR, ELECTRICAL] },
  toilet: { label: 'Toilet', groups: [TOILET, DOORS, WINDOWS, WALLS, FLOOR, ELECTRICAL] },
  hallway: { label: 'Hallway', groups: [HALLWAY, DOORS, WALLS, FLOOR, ELECTRICAL] },
  laundry: { label: 'Laundry', groups: [LAUNDRY, DOORS, WINDOWS, WALLS, FLOOR, ELECTRICAL] },
  balcony: { label: 'Balcony', groups: [BALCONY, OUTDOOR_ELECTRICAL] },
  patio: { label: 'Patio', groups: [PATIO, OUTDOOR_ELECTRICAL] },
  garage: { label: 'Garage', groups: [GARAGE, WINDOWS, ELECTRICAL] },
  garden: { label: 'Garden', groups: [GARDEN, OUTDOOR_ELECTRICAL] },
  storage: { label: 'Storage room', groups: [STORAGE] },
  general: { label: 'Keys, meters and services', groups: [GENERAL] },
  other: { label: 'Other room', groups: [DOORS, WINDOWS, WALLS, FLOOR, ELECTRICAL] },
};

export const ROOM_TYPES = Object.keys(ROOM_TEMPLATES) as RoomType[];

/** Suggested rooms for a new inspection, by property type. The person can add, remove and rename. */
export const DEFAULT_ROOMS: Record<PropertyType, RoomType[]> = {
  apartment: ['entrance', 'living', 'kitchen', 'bedroom', 'bathroom', 'balcony', 'general'],
  house: ['entrance', 'living', 'dining', 'kitchen', 'bedroom', 'bedroom', 'bathroom', 'hallway', 'laundry', 'garage', 'garden', 'general'],
  townhouse: ['entrance', 'living', 'kitchen', 'bedroom', 'bedroom', 'bathroom', 'patio', 'garage', 'general'],
  room: ['bedroom', 'bathroom', 'general'],
  commercial: ['entrance', 'other', 'kitchen', 'toilet', 'storage', 'general'],
  multi_unit: ['entrance', 'hallway', 'storage', 'garden', 'general'],
  other: ['entrance', 'living', 'kitchen', 'bedroom', 'bathroom', 'general'],
};

export const TEMPLATE_SETS = { 'standard-v1': ROOM_TEMPLATES } as const;
export type TemplateSetId = keyof typeof TEMPLATE_SETS;

export function getTemplateSet(id: string): Record<RoomType, { label: string; groups: TemplateGroup[] }> {
  return TEMPLATE_SETS[id as TemplateSetId] ?? ROOM_TEMPLATES;
}

export function groupLabel(templateSet: string, key: string): string {
  for (const room of Object.values(getTemplateSet(templateSet))) {
    const g = room.groups.find((x) => x.key === key);
    if (g) return g.label;
  }
  return key === 'custom' ? 'Added items' : key;
}
