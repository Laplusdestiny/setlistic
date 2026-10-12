// jsdom には matchMedia がないので、(min-width: Npx) だけを解釈する簡易版を入れる。
// setViewportWidth で幅を変えると、登録済みのリスナーに change を送る。
const listeners = new Set<() => void>();
let width = 375;

function matches(query: string) {
  const m = query.match(/min-width:\s*(\d+)px/);
  return m ? width >= Number(m[1]) : false;
}

export function installMatchMedia() {
  window.matchMedia = (query: string) =>
    ({
      media: query,
      get matches() {
        return matches(query);
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }) as unknown as MediaQueryList;
}

export function setViewportWidth(next: number) {
  width = next;
  listeners.forEach((fn) => fn());
}
