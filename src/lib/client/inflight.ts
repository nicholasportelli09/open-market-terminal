/** Count of AI requests in progress in this tab, so sync never reloads the page underneath one. */
let count = 0;

export async function trackRequest<T>(p: Promise<T>): Promise<T> {
  count++;
  try {
    return await p;
  } finally {
    count--;
  }
}

export function requestsInFlight(): number {
  return count;
}
