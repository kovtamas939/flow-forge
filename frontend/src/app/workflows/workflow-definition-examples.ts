export const CONDITION_EXAMPLES = [
  {
    label: 'exists',
    idPrefix: 'condition-exists',
    condition: {
      path: '/order/id',
      operator: 'exists',
    },
  },
  {
    label: 'equals',
    idPrefix: 'condition-equals',
    condition: {
      path: '/order/status',
      operator: 'equals',
      value: 'paid',
    },
  },
  {
    label: 'not_equals',
    idPrefix: 'condition-not-equals',
    condition: {
      path: '/order/status',
      operator: 'not_equals',
      value: 'cancelled',
    },
  },
  {
    label: 'greater_than',
    idPrefix: 'condition-greater-than',
    condition: {
      path: '/order/total',
      operator: 'greater_than',
      value: 100,
    },
  },
  {
    label: 'greater_than_or_equal',
    idPrefix: 'condition-greater-than-or-equal',
    condition: {
      path: '/order/total',
      operator: 'greater_than_or_equal',
      value: 100,
    },
  },
  {
    label: 'less_than',
    idPrefix: 'condition-less-than',
    condition: {
      path: '/order/total',
      operator: 'less_than',
      value: 100,
    },
  },
  {
    label: 'less_than_or_equal',
    idPrefix: 'condition-less-than-or-equal',
    condition: {
      path: '/order/total',
      operator: 'less_than_or_equal',
      value: 100,
    },
  },
  {
    label: 'contains',
    idPrefix: 'condition-contains',
    condition: {
      path: '/order/tags',
      operator: 'contains',
      value: 'priority',
    },
  },
] as const;

export type ConditionExample = (typeof CONDITION_EXAMPLES)[number];

export const ACTION_EXAMPLES = [
  {
    label: 'log',
    idPrefix: 'action-log',
    action: {
      type: 'log',
      message: 'A matching order was received',
    },
  },
  {
    label: 'notification',
    idPrefix: 'action-notification',
    action: {
      type: 'notification',
      recipient: 'team@example.com',
      message: 'A matching order was received',
    },
  },
  {
    label: 'http_request',
    idPrefix: 'action-http-request',
    action: {
      type: 'http_request',
      method: 'POST',
      url: 'https://example.com/',
      body: {
        event: 'order.received',
        orderId: 'replace-with-an-order-id',
      },
    },
  },
] as const;

export type ActionExample = (typeof ACTION_EXAMPLES)[number];