import { describe, it, expect } from "bun:test";
import { debounce } from "../src/modules/debounce";

describe("debounce", () => {
  it("delays execution by the specified time", async () => {
    let called = false;
    const fn = () => { called = true; };
    const debounced = debounce(fn, 50);

    debounced();
    expect(called).toBe(false);

    await Bun.sleep(60);
    expect(called).toBe(true);
  });

  it("only executes once for rapid successive calls", async () => {
    let count = 0;
    const fn = () => { count++; };
    const debounced = debounce(fn, 50);

    debounced();
    debounced();
    debounced();
    expect(count).toBe(0);

    await Bun.sleep(60);
    expect(count).toBe(1);
  });

  it("resets the timer on each call", async () => {
    let count = 0;
    const fn = () => { count++; };
    const debounced = debounce(fn, 50);

    debounced();
    await Bun.sleep(30);
    debounced();
    await Bun.sleep(30);
    expect(count).toBe(0);

    await Bun.sleep(30);
    expect(count).toBe(1);
  });

  it("cancel prevents execution", async () => {
    let called = false;
    const fn = () => { called = true; };
    const debounced = debounce(fn, 50);

    debounced();
    debounced.cancel();
    await Bun.sleep(60);
    expect(called).toBe(false);
  });

  it("passes arguments to the underlying function", async () => {
    let received: unknown[] = [];
    const fn = (...args: unknown[]) => { received = args; };
    const debounced = debounce(fn, 50);

    debounced("a", "b");
    await Bun.sleep(60);
    expect(received).toEqual(["a", "b"]);
  });

  it("uses the arguments from the last call only", async () => {
    let received: unknown[] = [];
    const fn = (...args: unknown[]) => { received = args; };
    const debounced = debounce(fn, 50);

    debounced("first");
    debounced("second");
    debounced("third");
    await Bun.sleep(60);
    expect(received).toEqual(["third"]);
  });
});
