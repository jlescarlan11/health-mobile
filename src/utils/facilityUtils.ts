import { Facility } from '../types';

export const OPEN_COLOR = '#379777';
export const WARNING_COLOR = '#F97316';
export const CLOSED_COLOR = '#6B7280';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const coerceBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return false;
};

const parseClockTime = (value: unknown): { hours: number; minutes: number } | null => {
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 24) return null;
  if (minutes < 0 || minutes > 59) return null;
  if (hours === 24 && minutes !== 0) return null;

  return { hours, minutes };
};

const formatTime12h = (timeStr: string): string => {
  const parsed = parseClockTime(timeStr);
  if (!parsed) return timeStr;
  const { hours, minutes } = parsed;
  const h12 = hours % 12 || 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  return `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

export const formatOperatingHours = (facility: Facility): string[] => {
  const { is_24_7, operatingHours, hours } = facility;

  if (is_24_7 || operatingHours?.is24x7) {
    return ['Open 24/7'];
  }

  if (operatingHours?.schedule) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const lines: string[] = [];

    // Group consecutive days with same hours
    let startDay = 0;
    while (startDay < 7) {
      const currentHours = operatingHours.schedule[startDay];
      let endDay = startDay;

      while (endDay < 6) {
        const nextHours = operatingHours.schedule[endDay + 1];
        if (JSON.stringify(currentHours) === JSON.stringify(nextHours)) {
          endDay++;
        } else {
          break;
        }
      }

      const dayRange = startDay === endDay ? days[startDay] : `${days[startDay]} - ${days[endDay]}`;
      const hoursStr = currentHours
        ? `${formatTime12h(currentHours.open)} - ${formatTime12h(currentHours.close)}`
        : 'Closed';

      lines.push(`${dayRange}: ${hoursStr}`);
      startDay = endDay + 1;
    }
    return lines;
  }

  if (operatingHours?.description) {
    return [operatingHours.description];
  }

  if (operatingHours?.open && operatingHours?.close) {
    return [
      `Daily: ${formatTime12h(operatingHours.open)} - ${formatTime12h(operatingHours.close)}`,
    ];
  }

  if (hours) {
    return [hours];
  }

  return ['Hours not available'];
};

export const getOpenStatus = (
  facility: Facility,
): { isOpen: boolean; text: string; color: string } => {
  const { hours, is_24_7, operatingHours } = facility;

  // 0. Check explicit 24/7 flag first
  if (is_24_7 || (operatingHours && coerceBoolean(operatingHours.is24x7))) {
    return { isOpen: true, text: 'Open 24/7', color: OPEN_COLOR };
  }

  // 1. Check structured data next
  if (isRecord(operatingHours)) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sun, 6 = Sat
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;

    // Check specific schedule for today
    if (isRecord(operatingHours.schedule)) {
      const todayHours = operatingHours.schedule[dayOfWeek];

      if (todayHours === null) {
        // Find when it opens next
        for (let i = 1; i <= 7; i++) {
          const nextDay = (dayOfWeek + i) % 7;
          const nextDayHours = operatingHours.schedule[nextDay];
          if (nextDayHours && isRecord(nextDayHours)) {
            const dayNames = [
              'Sunday',
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
            ];
            const prefix = i === 1 ? 'Tomorrow' : dayNames[nextDay];
            return {
              isOpen: false,
              text: `Closed - Opens ${prefix} at ${formatTime12h(nextDayHours.open)}`,
              color: CLOSED_COLOR,
            };
          }
        }
        return { isOpen: false, text: 'Closed Today', color: CLOSED_COLOR };
      }

      if (isRecord(todayHours)) {
        const parsedOpen = parseClockTime(todayHours.open);
        const parsedClose = parseClockTime(todayHours.close);

        if (parsedOpen && parsedClose) {
          const openTimeInMinutes = parsedOpen.hours * 60 + parsedOpen.minutes;
          let closeTimeInMinutes = parsedClose.hours * 60 + parsedClose.minutes;
          if (closeTimeInMinutes === 0) closeTimeInMinutes = 24 * 60;

          if (
            currentTimeInMinutes >= openTimeInMinutes &&
            currentTimeInMinutes < closeTimeInMinutes
          ) {
            if (closeTimeInMinutes - currentTimeInMinutes <= 30) {
              return {
                isOpen: true,
                text: `Closes at ${formatTime12h(todayHours.close)}`,
                color: WARNING_COLOR,
              };
            }
            return {
              isOpen: true,
              text: `Open until ${formatTime12h(todayHours.close)}`,
              color: OPEN_COLOR,
            };
          } else if (currentTimeInMinutes < openTimeInMinutes) {
            const minutesUntilOpen = openTimeInMinutes - currentTimeInMinutes;
            const statusText =
              minutesUntilOpen <= 240
                ? `Opens at ${formatTime12h(todayHours.open)}`
                : `Closed - Opens at ${formatTime12h(todayHours.open)}`;
            return {
              isOpen: false,
              text: statusText,
              color: CLOSED_COLOR,
            };
          } else {
            // Closed for today, find next opening
            for (let i = 1; i <= 7; i++) {
              const nextDay = (dayOfWeek + i) % 7;
              const nextDayHours = operatingHours.schedule[nextDay];
              if (nextDayHours && isRecord(nextDayHours)) {
                const dayNames = [
                  'Sunday',
                  'Monday',
                  'Tuesday',
                  'Wednesday',
                  'Thursday',
                  'Friday',
                  'Saturday',
                ];
                const prefix = i === 1 ? 'Tomorrow' : dayNames[nextDay];
                return {
                  isOpen: false,
                  text: `Closed - Opens ${prefix} at ${formatTime12h(nextDayHours.open)}`,
                  color: CLOSED_COLOR,
                };
              }
            }
            return { isOpen: false, text: 'Closed', color: CLOSED_COLOR };
          }
        }
      }
    }

    // Fallback to simple open/close if schedule missing
    const parsedOpen = parseClockTime(operatingHours.open);
    const parsedClose = parseClockTime(operatingHours.close);
    if (parsedOpen && parsedClose) {
      const openTimeInMinutes = parsedOpen.hours * 60 + parsedOpen.minutes;
      const closeTimeInMinutes = parsedClose.hours * 60 + parsedClose.minutes;

      if (currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes < closeTimeInMinutes) {
        return { isOpen: true, text: 'Open Now', color: OPEN_COLOR };
      } else if (currentTimeInMinutes < openTimeInMinutes) {
        const minutesUntilOpen = openTimeInMinutes - currentTimeInMinutes;
        const statusText =
          minutesUntilOpen <= 240
            ? `Opens at ${formatTime12h(operatingHours.open as string)}`
            : `Closed - Opens at ${formatTime12h(operatingHours.open as string)}`;
        return {
          isOpen: false,
          text: statusText,
          color: CLOSED_COLOR,
        };
      } else {
        return { isOpen: false, text: 'Closed', color: CLOSED_COLOR };
      }
    }
  }

  // 2. Fallback to legacy string parsing
  if (!hours) return { isOpen: false, text: 'Hours N/A', color: CLOSED_COLOR };

  if (hours.toLowerCase().includes('24/7') || hours.toLowerCase().includes('24 hours')) {
    return { isOpen: true, text: 'Open 24/7', color: OPEN_COLOR };
  }

  const now = new Date();
  const currentHour = now.getHours();
  if (currentHour >= 8 && currentHour < 17) {
    return { isOpen: true, text: 'Open Now', color: OPEN_COLOR };
  }

  return { isOpen: false, text: 'Closed', color: CLOSED_COLOR };
};

/**
 * Maps colloquial medical terms or AI-recommended services to canonical VALID_SERVICES.
 * Ensures consistent matching even if the AI uses slightly different terminology.
 */
export const resolveServiceAlias = (service: string): string => {
  const s = service.toLowerCase();

  // Mapping to strict VALID_SERVICES
  if (s.includes('bite') || s.includes('rabies') || s.includes('animal'))
    return 'Animal Bite Clinic';
  if (s.includes('baby') || s.includes('child') || s.includes('pedia') || s.includes('infant'))
    return 'Pediatrics';
  if (
    s.includes('pregnant') ||
    s.includes('prenatal') ||
    s.includes('maternal') ||
    s.includes('mother') ||
    s.includes('pregnancy')
  )
    return 'Maternal Care';
  if (
    s.includes('tooth') ||
    s.includes('teeth') ||
    s.includes('mouth') ||
    s.includes('dental') ||
    s.includes('oral')
  )
    return 'Dental';
  if (s.includes('skin') || s.includes('rash') || s.includes('derma') || s.includes('itch'))
    return 'Dermatology';
  if (s.includes('eyes') || s.includes('vision') || s.includes('sight') || s.includes('ophthal'))
    return 'Eye Center';
  if (
    s.includes('psych') ||
    s.includes('mental') ||
    s.includes('depress') ||
    s.includes('anxiety') ||
    s.includes('behavioral')
  )
    return 'Mental Health';
  if (s.includes('bone') || s.includes('fracture') || s.includes('ortho') || s.includes('broken'))
    return 'Surgery';
  if (
    s.includes('cut') ||
    s.includes('wound') ||
    s.includes('stitch') ||
    s.includes('injury') ||
    s.includes('trauma')
  )
    return 'Trauma Care';
  if (
    s.includes('heart') ||
    s.includes('cardio') ||
    s.includes('chest pain') ||
    s.includes('blood pressure') ||
    s.includes('hypertension')
  )
    return 'Internal Medicine';
  if (
    s.includes('lungs') ||
    s.includes('breath') ||
    s.includes('pulmo') ||
    s.includes('respiratory') ||
    s.includes('asthma') ||
    s.includes('cough')
  )
    return 'Internal Medicine';
  if (
    s.includes('stomach') ||
    s.includes('digestion') ||
    s.includes('nausea') ||
    s.includes('diarrhea') ||
    s.includes('gastric')
  )
    return 'Internal Medicine';
  if (
    s.includes('kidney') ||
    s.includes('renal') ||
    s.includes('urinary') ||
    s.includes('dialysis')
  )
    return 'Dialysis';
  if (s.includes('ear') || s.includes('nose') || s.includes('throat') || s.includes('ent'))
    return 'ENT';
  if (s.includes('x-ray') || s.includes('xray') || s.includes('imaging') || s.includes('scan'))
    return 'X-ray';
  if (
    s.includes('blood test') ||
    s.includes('lab') ||
    s.includes('laboratory') ||
    s.includes('stool test') ||
    s.includes('urine test')
  )
    return 'Laboratory';
  if (s.includes('vaccine') || s.includes('vax') || s.includes('shot') || s.includes('immuniz'))
    return 'Immunization';
  if (s.includes('emergency') || s.includes('er') || s.includes('urgent')) return 'Emergency';
  if (s.includes('checkup') || s.includes('general') || s.includes('routine'))
    return 'General Medicine';
  if (s.includes('adolescent') || s.includes('teen')) return 'Adolescent Health';
  if (s.includes('ob') || s.includes('gyne') || s.includes('women health')) return 'OB-GYN';
  if (s.includes('nutrition') || s.includes('diet') || s.includes('weight'))
    return 'Nutrition Services';
  if (s.includes('family planning') || s.includes('contraception') || s.includes('birth control'))
    return 'Family Planning';

  return service;
};

const combineFacilityServices = (facility: Facility): string[] => [
  ...(facility.services || []),
  ...(facility.specialized_services || []),
];

const normalize = (value: string) => value.toLowerCase().trim();

export const getFacilityServiceMatches = (
  facility: Facility,
  relevantServices: string[],
): string[] => {
  if (!relevantServices || relevantServices.length === 0) return [];

  const allServices = combineFacilityServices(facility);
  if (allServices.length === 0) return [];

  const matched = new Set<string>();

  relevantServices.forEach((req) => {
    const resolved = resolveServiceAlias(req).trim();
    const normalizedResolved = normalize(resolved);

    const matchedService = allServices.find((service) => {
      const normalizedService = normalize(service);
      return (
        normalizedService.includes(normalizedResolved) ||
        normalizedResolved.includes(normalizedService)
      );
    });

    if (matchedService) {
      matched.add(matchedService);
    }
  });

  return Array.from(matched);
};

/**
 * Calculates a priority score for a facility based on the formula:
 * 1. Service Alignment (Matches user needs) - Primary factor
 * 2. Distance - Secondary factor
 * 3. Operating Status (Open/Closed) - Tertiary factor
 * 4. Yakap Accreditation - Plus points bonus
 * Higher score = higher priority.
 */
export const scoreFacility = (
  facility: Facility,
  targetLevel: string,
  requiredServices: string[],
) => {
  let score = 0;

  // 1. Service Alignment (Primary)
  // Level match
  const type = facility.type?.toLowerCase() || '';
  const isEmergencyTarget = targetLevel === 'emergency' || targetLevel === 'hospital';
  const isHealthCenterTarget = targetLevel === 'health_center';

  const matchesEmergency =
    type.includes('hospital') || type.includes('infirmary') || type.includes('emergency');
  const matchesHealthCenter =
    type.includes('health') || type.includes('unit') || type.includes('center');

  if ((isEmergencyTarget && matchesEmergency) || (isHealthCenterTarget && matchesHealthCenter)) {
    score += 1000;
  }

  // Service matches (Very high weight to make it the primary factor)
  if (requiredServices.length > 0) {
    const matchedServices = getFacilityServiceMatches(facility, requiredServices);
    // 2000 points for each service match
    score += matchedServices.length * 2000;

    // Bonus for matching all required services
    if (matchedServices.length === requiredServices.length && requiredServices.length > 0) {
      score += 500;
    }
  }

  // 2. Distance (Secondary)
  const distance = facility.distance || 0;
  // Subtract points based on distance (100 points per km)
  score -= distance * 100;

  // 3. Operating Status (Tertiary)
  const status = getOpenStatus(facility);
  if (status.isOpen) {
    score += 1500; // Significant bonus for being open
  }

  // 4. Yakap Accreditation (Plus points)
  if (facility.yakapAccredited) {
    score += 800;
  }

  return score;
};

/**
 * Filter and score facilities based on relevant services from an assessment.
 * Returns facilities with an additional matchScore and explanation of matches.
 */
export interface ScoredFacility extends Facility {
  matchScore: number;
  matchedServices: string[];
}

export const filterFacilitiesByServices = (
  facilities: Facility[],
  relevantServices: string[],
): ScoredFacility[] => {
  if (!relevantServices || relevantServices.length === 0) {
    return facilities.map((f) => ({ ...f, matchScore: 0, matchedServices: [] }));
  }

  return facilities
    .map((facility) => {
      const matchedServices = getFacilityServiceMatches(facility, relevantServices);
      const matchScore = matchedServices.length * 100;

      return {
        ...facility,
        matchScore,
        matchedServices,
      };
    })
    .filter((f) => f.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
};
