import { CronExpressionParser } from 'cron-parser';
import { cronExpression } from './business.ts';
import type { ScheduleRule } from './business.ts';

export function nextOccurrence(rule: ScheduleRule, timeZone: string, now: number): string | null {
  if (rule.kind === 'delay' || rule.kind === 'once') return null;
  if (rule.kind === 'cron') {
    try {
      return CronExpressionParser.parse(cronExpression.parse(rule.expression), {
        currentDate: new Date(now),
        tz: timeZone,
      })
        .next()
        .toISOString();
    } catch {
      throw new Error('SCHEDULE_CRON_INVALID');
    }
  }
  const [hour, minute] =
    rule.kind === 'hourly' ? ['*', rule.minute] : rule.time.split(':').map(Number);
  const days = rule.kind === 'weekly' ? rule.weekdays.join(',') : '*';
  return CronExpressionParser.parse(`0 ${minute} ${hour} * * ${days}`, {
    currentDate: new Date(now),
    tz: timeZone,
  })
    .next()
    .toISOString();
}

export function firstOccurrence(rule: ScheduleRule, timeZone: string, now: number): string {
  if (rule.kind === 'delay') return new Date(now + rule.seconds * 1000).toISOString();
  if (rule.kind === 'once') {
    if (Date.parse(rule.at) <= now) throw new Error('SCHEDULE_TIME_PASSED');
    return rule.at;
  }
  return nextOccurrence(rule, timeZone, now)!;
}
