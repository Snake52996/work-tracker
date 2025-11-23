export function dual_way_filter<T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => boolean
): [T[], T[]] {
  return array.reduce(
    (previous, current, index, arr) => {
      const [positive, negative] = previous;
      (predicate(current, index, arr) ? positive : negative).push(current);
      return [positive, negative];
    },
    [[], []] as [T[], T[]]
  );
}

// try to complete the url by prepending https:// if required
//  return an instance of URL is one can be constructed, null if all attempts have failed
export function try_complete_url(url: string): URL | null {
  const attempts = [url, `https://${url}`].map((url) => URL.parse(url)).filter((value) => value !== null)[0];
  return attempts === undefined ? null : attempts;
}

// just like Promise.allSettled but with retry functionality
//  supply a batch of async tasks (callables) that should be executed. The execution will be retried if the
//  previous launched failed for each task, up to 3 times or max_retry specified.
//  there will be a 500ms delay between two launches, which can be configured with retry_delay
export async function attempts_to<T>(
  callables: (() => Promise<T>)[],
  options?: { max_retry?: number; retry_delay?: number }
): Promise<({ succeed: true; result: T } | { succeed: false; reason: any })[]> {
  const max_retries = options?.max_retry ?? 3;
  const retry_delay = options?.retry_delay ?? 500;
  const final_result = new Array<{ succeed: true; result: any } | { succeed: false; reason: any }>(
    callables.length
  );
  async function try_tasks(
    tasks: [index: number, callable: () => Promise<any>][],
    retries_remaining: number
  ): Promise<void> {
    const local_results = await Promise.allSettled(tasks.map(([_, callable]) => callable()));
    // bind the result with the task specifications
    const full_local_results = local_results.map((result, index) => ({
      task: tasks[index]!,
      result: result,
    }));
    // separate succeed and failed executions
    const [succeed, failed] = dual_way_filter(
      full_local_results,
      ({ result }) => result.status === "fulfilled"
    );
    // place results for succeed launches
    succeed.forEach(({ task: [index], result }) => {
      if (result.status !== "fulfilled") {
        return; // never happens, just here to make TypeScript happy
      }
      final_result[index] = { succeed: true, result: result.value };
    });
    // if there is no failed tasks, we can return now
    if (failed.length === 0) {
      return;
    }
    // if we have run out of retries, place reason of failed tasks to final result and return
    if (retries_remaining <= 0) {
      failed.forEach(({ task: [index], result }) => {
        if (result.status !== "rejected") {
          return; // never happens, just here to make TypeScript happy
        }
        final_result[index] = { succeed: false, reason: result.reason };
      });
      return;
    }
    // conduct a retry
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(
          try_tasks(
            failed.map(({ task }) => task),
            retries_remaining - 1
          )
        );
      }, retry_delay);
    });
  }
  await try_tasks(
    callables.map((callable, index): [number, () => Promise<any>] => [index, callable]),
    max_retries
  );
  return final_result;
}
