import { executePlan } from '../executor/taskExecutor';
import { classifyIntent } from '../intent/classifier';
import { buildExecutionPlan } from '../planner/taskPlanner';

export async function processUserMessage(message: string): Promise<string> {
  const intent = classifyIntent(message);
  const plan = buildExecutionPlan(intent, message);
  return executePlan(plan);
}
