import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const record = { ipoNo: 1, broker: "KB증권", qty: 2, sellPrice: 10000 };
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-ipo",
    firestore: { rules: readFileSync("../firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/alice/records/r1"), record);
    await setDoc(doc(ctx.firestore(), "users/alice/meta/settings"), { taxRate: 0.2 });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();
const guest = () => env.unauthenticatedContext().firestore();

describe("본인", () => {
  it("자기 기록을 읽고 쓰고 지울 수 있다", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice/records/r1")));
    await assertSucceeds(getDocs(collection(alice(), "users/alice/records")));
    await assertSucceeds(setDoc(doc(alice(), "users/alice/records/r2"), { ...record, sellPrice: null }));
    await assertSucceeds(deleteDoc(doc(alice(), "users/alice/records/r1")));
  });

  it("자기 설정을 읽고 쓸 수 있다", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice/meta/settings")));
    await assertSucceeds(setDoc(doc(alice(), "users/alice/meta/settings"), { taxRate: 0.1, myBrokers: ["KB증권"] }));
  });

  it("형식이 잘못된 기록은 저장할 수 없다", async () => {
    const path = "users/alice/records/bad";
    await assertFails(setDoc(doc(alice(), path), { ...record, qty: -1 }));
    await assertFails(setDoc(doc(alice(), path), { ...record, qty: "2" }));
    await assertFails(setDoc(doc(alice(), path), { ...record, extra: true }));
    await assertFails(setDoc(doc(alice(), path), { broker: "KB증권", qty: 1 }));
  });

  it("정해진 항목 외의 설정은 저장할 수 없다", async () => {
    await assertFails(setDoc(doc(alice(), "users/alice/meta/settings"), { admin: true }));
  });
});

describe("다른 계정", () => {
  it("남의 기록을 읽을 수 없다", async () => {
    await assertFails(getDoc(doc(bob(), "users/alice/records/r1")));
    await assertFails(getDocs(collection(bob(), "users/alice/records")));
    await assertFails(getDoc(doc(bob(), "users/alice/meta/settings")));
  });

  it("남의 기록을 바꾸거나 지울 수 없다", async () => {
    await assertFails(setDoc(doc(bob(), "users/alice/records/r1"), record));
    await assertFails(deleteDoc(doc(bob(), "users/alice/records/r1")));
    await assertFails(setDoc(doc(bob(), "users/alice/meta/settings"), { taxRate: 0 }));
  });
});

describe("로그인하지 않은 사용자", () => {
  it("아무것도 읽거나 쓸 수 없다", async () => {
    await assertFails(getDoc(doc(guest(), "users/alice/records/r1")));
    await assertFails(getDocs(collection(guest(), "users/alice/records")));
    await assertFails(setDoc(doc(guest(), "users/alice/records/r9"), record));
  });
});

describe("정해지지 않은 경로", () => {
  it("로그인해도 접근할 수 없다", async () => {
    await assertFails(getDocs(collection(alice(), "users")));
    await assertFails(setDoc(doc(alice(), "other/x"), { a: 1 }));
    await assertFails(setDoc(doc(alice(), "users/alice/meta/other"), { a: 1 }));
  });
});
