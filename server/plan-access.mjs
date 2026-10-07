// Adding a renewal receivable must not erase access bought by the original payment.
// Refunding below that confirmed amount still revokes access.
export function studyPlanStatus(plan,order){return order&&(order.status==='cancelled'||order.paid<(plan.accessPaymentFloor??order.total))?'REVOKED':plan.customer?.status;}
