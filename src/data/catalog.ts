export type ClassType = 'yoga' | 'hiit' | 'spin' | 'pilates' | 'strength' | 'dance'
export type CoachName = 'Maya' | 'Dre' | 'Ines' | 'Tomas' | 'Kiara'

export interface TypeStyle {
  label: string
  bg: string
  fg: string
}

export const TYPES: Record<ClassType, TypeStyle> = {
  yoga: { label: 'Yoga', bg: '#2E5A3F', fg: '#CDEBD5' },
  hiit: { label: 'HIIT', bg: '#6B2B22', fg: '#FFD1C7' },
  spin: { label: 'Spin', bg: '#2A3F73', fg: '#CFDCFF' },
  pilates: { label: 'Pilates', bg: '#4A3470', fg: '#E4D6FA' },
  strength: { label: 'Strength', bg: '#5E4A1A', fg: '#F8E4B0' },
  dance: { label: 'Dance', bg: '#6A2846', fg: '#FBD0E1' },
}

export const TYPE_KEYS = Object.keys(TYPES) as ClassType[]

export interface Coach {
  role: string
  color: string
  bio: string
}

export const COACHES: Record<CoachName, Coach> = {
  Maya: { role: 'Yoga & mobility', color: '#9FD7AE', bio: 'Ten years teaching. Slow, precise, and very good with beginners and bad backs.' },
  Dre: { role: 'HIIT & strength', color: '#FF9E8C', bio: 'Former sprinter. Loud playlist, honest coaching, scales every movement.' },
  Ines: { role: 'Spin', color: '#9DB7FF', bio: 'Rides to the beat. Her Friday class has a waitlist most weeks.' },
  Tomas: { role: 'Pilates', color: '#CDB4F6', bio: 'Reformer and mat. Will fix your posture whether you asked or not.' },
  Kiara: { role: 'Dance', color: '#F7A5C6', bio: 'Commercial and afro-fusion. Zero judgement, maximum sweat.' },
}

export const DESCRIPTIONS: Record<ClassType, string> = {
  yoga: 'Breath-led movement to build strength and range without forcing anything. Props available; come as you are.',
  hiit: 'Intervals of hard work and real rest. Every movement has a low-impact option, and Dre will show you it.',
  spin: 'Rhythm riding in a dark room with a loud playlist. Shoes provided, resistance is your call.',
  pilates: 'Slow, controlled, and surprisingly hard. Reformer classes cap at ten so everyone gets corrections.',
  strength: 'Barbells and dumbbells, coached properly. You will learn to squat, hinge, push and pull.',
  dance: 'Learn a short routine, then perform it badly and happily. No experience needed.',
}

/** One recurring slot in the weekly template. */
export interface TemplateSlot {
  time: string // "HH:MM"
  name: string
  type: ClassType
  coach: CoachName
  mins: number
  cap: number
}

const slot = (time: string, name: string, type: ClassType, coach: CoachName, mins: number, cap: number): TemplateSlot => ({
  time, name, type, coach, mins, cap,
})

/** Weekly template keyed by JS weekday (0 = Sunday … 6 = Saturday). */
export const TEMPLATE: Record<number, TemplateSlot[]> = {
  1: [
    slot('06:30', 'Sunrise Flow', 'yoga', 'Maya', 60, 16),
    slot('07:30', 'HIIT 45', 'hiit', 'Dre', 45, 14),
    slot('12:15', 'Lunch Spin', 'spin', 'Ines', 45, 18),
    slot('18:00', 'Reformer Basics', 'pilates', 'Tomas', 55, 10),
    slot('19:15', 'Strength Foundations', 'strength', 'Dre', 60, 12),
  ],
  2: [
    slot('06:30', 'Power Yoga', 'yoga', 'Maya', 60, 16),
    slot('07:30', 'Spin Express', 'spin', 'Ines', 30, 18),
    slot('12:15', 'Core & Mobility', 'pilates', 'Tomas', 45, 12),
    slot('18:00', 'HIIT 45', 'hiit', 'Dre', 45, 14),
    slot('19:15', 'Afro Fusion', 'dance', 'Kiara', 60, 20),
  ],
  3: [
    slot('06:30', 'Sunrise Flow', 'yoga', 'Maya', 60, 16),
    slot('07:30', 'Strength Foundations', 'strength', 'Dre', 60, 12),
    slot('12:15', 'Lunch Spin', 'spin', 'Ines', 45, 18),
    slot('18:00', 'Mat Pilates', 'pilates', 'Tomas', 50, 14),
    slot('19:15', 'HIIT 30', 'hiit', 'Dre', 30, 14),
  ],
  4: [
    slot('06:30', 'Slow Yin', 'yoga', 'Maya', 60, 16),
    slot('07:30', 'HIIT 45', 'hiit', 'Dre', 45, 14),
    slot('12:15', 'Reformer Basics', 'pilates', 'Tomas', 55, 10),
    slot('18:00', 'Ride & Climb', 'spin', 'Ines', 45, 18),
    slot('19:15', 'Commercial Dance', 'dance', 'Kiara', 60, 20),
  ],
  5: [
    slot('06:30', 'Power Yoga', 'yoga', 'Maya', 60, 16),
    slot('07:30', 'Spin Express', 'spin', 'Ines', 30, 18),
    slot('12:15', 'Strength Foundations', 'strength', 'Dre', 60, 12),
    slot('17:30', 'Friday Ride', 'spin', 'Ines', 45, 18),
    slot('18:45', 'Deep Stretch', 'yoga', 'Maya', 45, 16),
  ],
  6: [
    slot('08:00', 'Weekend Flow', 'yoga', 'Maya', 75, 20),
    slot('09:30', 'HIIT 45', 'hiit', 'Dre', 45, 14),
    slot('10:45', 'Afro Fusion', 'dance', 'Kiara', 60, 20),
    slot('12:00', 'Reformer Open', 'pilates', 'Tomas', 55, 10),
  ],
  0: [
    slot('09:00', 'Slow Yin', 'yoga', 'Maya', 60, 16),
    slot('10:30', 'Sunday Strength', 'strength', 'Dre', 60, 12),
  ],
}

export const PACK_SIZE = 10
export const CANCEL_WINDOW_MS = 2 * 60 * 60 * 1000
export const BOARD_START_HOUR = 6
export const BOARD_END_HOUR = 21
export const HOUR_PX = 68
