/* eslint-disable @typescript-eslint/no-explicit-any */
import { firestore } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import { FieldValue } from 'firebase-admin/firestore';

// コレクション名のマッピング
const COLLECTION_MAP: Record<string, string> = {
  organization: 'organizations',
  staff: 'staff',
  attendance: 'attendances',
  leaveRequest: 'leave_requests',
  leaveApproval: 'leave_approvals',
  leaveBalance: 'leave_balances',
  dutyMaster: 'duty_masters',
  settingMaster: 'setting_masters',
  specialLeaveMaster: 'special_leave_masters',
  specialLeaveBalance: 'special_leave_balances',
  schedule: 'schedules',
  leaveOfAbsenceRecord: 'leave_of_absence_records',
};

// 複合ユニークキーのマッピング
const COMPOUND_UNIQUE_KEYS: Record<string, Record<string, string[]>> = {
  attendance: { staffId_workDate: ['staffId', 'workDate'] },
  leaveBalance: { staffId_fiscalYear: ['staffId', 'fiscalYear'] },
  leaveApproval: { requestId: ['requestId'] },
  settingMaster: { orgId_key: ['orgId', 'key'] },
  specialLeaveMaster: { orgId_name: ['orgId', 'name'] },
  specialLeaveBalance: { staffId_fiscalYear_leaveType: ['staffId', 'fiscalYear', 'leaveType'] },
  dutyMaster: { orgId_name: ['orgId', 'name'] },
};

function getCollection(modelName: string) {
  const col = COLLECTION_MAP[modelName];
  if (!col) throw new Error(`Unknown model: ${modelName}`);
  return firestore.collection(col);
}

interface WhereResult {
  query: FirebaseFirestore.Query;
  postFilters: ((item: any) => boolean)[];
}

// Firestore の where 条件を適用（インデックス不要な方式）
// 最初の == 条件だけFirestoreに渡し、残りはすべてpost-filterで処理する
function applyWhereClause(baseQuery: FirebaseFirestore.Query, where: any): WhereResult {
  const postFilters: ((item: any) => boolean)[] = [];
  let query = baseQuery;
  if (!where) return { query, postFilters };
  
  let firstEqApplied = false;
  
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const condition = value as any;
      if ('not' in condition) {
        const notVal = condition.not;
        postFilters.push((item: any) => item[key] !== notVal);
      }
      if ('in' in condition) {
        if (condition.in.length > 0) {
          const vals = condition.in;
          postFilters.push((item: any) => vals.includes(item[key]));
        }
      }
      if ('gte' in condition) {
        const v = condition.gte;
        postFilters.push((item: any) => item[key] >= v);
      }
      if ('lte' in condition) {
        const v = condition.lte;
        postFilters.push((item: any) => item[key] <= v);
      }
      if ('gt' in condition) {
        const v = condition.gt;
        postFilters.push((item: any) => item[key] > v);
      }
      if ('lt' in condition) {
        const v = condition.lt;
        postFilters.push((item: any) => item[key] < v);
      }
      if ('contains' in condition) {
        const s = condition.contains;
        postFilters.push((item: any) => typeof item[key] === 'string' && item[key].includes(s));
      }
      if ('startsWith' in condition) {
        const s = condition.startsWith;
        postFilters.push((item: any) => typeof item[key] === 'string' && item[key].startsWith(s));
      }
      if ('endsWith' in condition) {
        const s = condition.endsWith;
        postFilters.push((item: any) => typeof item[key] === 'string' && item[key].endsWith(s));
      }
      if (!('not' in condition || 'in' in condition || 'gte' in condition || 'lte' in condition || 
            'gt' in condition || 'lt' in condition || 'contains' in condition || 
            'startsWith' in condition || 'endsWith' in condition)) {
        // ネストされたオブジェクト（compound unique key または Relation filter）
        // ただし、 Relation filter は現状サポート外なので、ここに来た場合は 1つ目の EqApplied チェックを行う
        for (const [subKey, subValue] of Object.entries(condition)) {
          if (!firstEqApplied) {
            query = query.where(subKey, '==', subValue);
            firstEqApplied = true;
          } else {
            const sv = subValue;
            postFilters.push((item: any) => item[subKey] === sv);
          }
        }
      }
    } else {
      if (!firstEqApplied) {
        query = query.where(key, '==', value);
        firstEqApplied = true;
      } else {
        const v = value;
        postFilters.push((item: any) => item[key] === v);
      }
    }
  }
  return { query, postFilters };
}

function applyPostFilters(results: any[], postFilters: ((item: any) => boolean)[]): any[] {
  if (postFilters.length === 0) return results;
  return results.filter(item => postFilters.every(fn => fn(item)));
}

// インメモリでのソート処理
function applyInMemoryOrderBy(results: any[], orderBy: any): any[] {
  if (!orderBy) return results;
  
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  
  return [...results].sort((a, b) => {
    for (const order of orders) {
      const [key, dir] = Object.entries(order)[0];
      const aVal = a[key];
      const bVal = b[key];
      
      if (aVal === bVal) continue;
      
      const multiplier = dir === 'desc' ? -1 : 1;
      if (aVal === null || aVal === undefined) return 1 * multiplier;
      if (bVal === null || bVal === undefined) return -1 * multiplier;
      
      return aVal < bVal ? -1 * multiplier : 1 * multiplier;
    }
    return 0;
  });
}

// ドキュメントデータのフィルタリング（select対応）
function applySelect(data: any, select: any): any {
  if (!select) return data;
  const result: any = {};
  for (const key of Object.keys(select)) {
    if (select[key] === true || select[key]) {
      result[key] = data[key];
    }
  }
  return result;
}

// increment/decrement の処理
function processData(data: any): any {
  const processed: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const op = value as any;
      if ('increment' in op) {
        processed[key] = FieldValue.increment(op.increment);
      } else if ('decrement' in op) {
        processed[key] = FieldValue.increment(-op.decrement);
      } else {
        processed[key] = value;
      }
    } else {
      processed[key] = value;
    }
  }
  return processed;
}

// 複合ユニークキーからドキュメントを探す
async function findByCompoundKey(modelName: string, where: any): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const col = getCollection(modelName);
  const compoundKeys = COMPOUND_UNIQUE_KEYS[modelName];
  
  if (compoundKeys) {
    for (const [keyName, fields] of Object.entries(compoundKeys)) {
      if (where[keyName]) {
        const values = where[keyName];
        let query: FirebaseFirestore.Query = col;
        for (const field of fields) {
          query = query.where(field, '==', values[field]);
        }
        const snapshot = await query.limit(1).get();
        return snapshot.empty ? null : snapshot.docs[0];
      }
    }
  }

  // id で検索
  if (where.id) {
    const doc = await col.doc(where.id).get();
    return doc.exists ? doc : null;
  }

  // loginId 等の単一ユニークキー
  // インデックスエラー回避のため、1つだけ条件に使い、残りは取得後にチェックすることも検討
  // ただし findUnique/findFirst は通常 ID か単一キーなのでそのままに
  let query: FirebaseFirestore.Query = col;
  let first = true;
  const postChecks: [string, any][] = [];
  
  for (const [key, value] of Object.entries(where)) {
    if (value !== undefined) {
      if (first) {
        query = query.where(key, '==', value);
        first = false;
      } else {
        postChecks.push([key, value]);
      }
    }
  }
  
  const snapshot = await query.limit(postChecks.length > 0 ? 100 : 1).get();
  if (snapshot.empty) return null;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (postChecks.every(([k, v]) => data[k] === v)) {
      return doc;
    }
  }
  
  return null;
}

// モデルプロキシの作成
function createModelProxy(modelName: string) {
  return {
    async findMany(options?: any): Promise<any[]> {
      const col = getCollection(modelName);
      let query: FirebaseFirestore.Query = col;
      let postFilters: ((item: any) => boolean)[] = [];

      if (options?.where) {
        const result = applyWhereClause(query, options.where);
        query = result.query;
        postFilters = result.postFilters;
      }

      // インデックスエラー回避のため orderBy はインメモリで行う
      // Firestoreのクエリからは orderBy を外す
      
      const snapshot = await query.get();
      let results = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

      // post-filter の適用
      results = applyPostFilters(results, postFilters);

      // インメモリ orderBy
      if (options?.orderBy) {
        results = applyInMemoryOrderBy(results, options.orderBy);
      }

      // インメモリ take (limit)
      if (options?.take) {
        results = results.slice(0, options.take);
      }

      // include の処理（リレーション）
      if (options?.include) {
        for (const [relName, relOptions] of Object.entries(options.include)) {
          if (relOptions === true || relOptions) {
            results = await Promise.all(results.map(async (item: any) => {
              const related = await resolveRelation(modelName, relName, item, relOptions);
              return { ...item, [relName]: related };
            }));
          }
        }
      }

      if (options?.select) {
        results = results.map((r: any) => applySelect(r, options.select));
      }

      return results;
    },

    async findUnique(options: any): Promise<any | null> {
      const doc = await findByCompoundKey(modelName, options.where);
      if (!doc) return null;
      
      let result = { ...doc.data(), id: doc.id };

      if (options?.include) {
        for (const [relName, relOptions] of Object.entries(options.include)) {
          if (relOptions === true || relOptions) {
            const related = await resolveRelation(modelName, relName, result, relOptions);
            result = { ...result, [relName]: related };
          }
        }
      }

      if (options?.select) {
        result = applySelect(result, options.select);
      }

      return result;
    },

    async findFirst(options?: any): Promise<any | null> {
      const col = getCollection(modelName);
      let query: FirebaseFirestore.Query = col;
      let postFilters: ((item: any) => boolean)[] = [];

      if (options?.where) {
        const result = applyWhereClause(query, options.where);
        query = result.query;
        postFilters = result.postFilters;
      }

      // postFilterがない場合は1件だけ取得して即返す（最大の最適化）
      // postFilterがある場合は多めに取得してフィルタリング（ただし上限を200に抑える）
      const fetchLimit = postFilters.length > 0 ? 200 : 1;
      const snapshot = await query.limit(fetchLimit).get();
      if (snapshot.empty) return null;
      
      let docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      docs = applyPostFilters(docs, postFilters);
      
      if (options?.orderBy) {
        docs = applyInMemoryOrderBy(docs, options.orderBy);
      }
      
      if (docs.length === 0) return null;

      let result = docs[0];

      if (options?.include) {
        for (const [relName, relOptions] of Object.entries(options.include)) {
          if (relOptions === true || relOptions) {
            const related = await resolveRelation(modelName, relName, result, relOptions);
            result = { ...result, [relName]: related };
          }
        }
      }

      return result;
    },

    async create(options: any): Promise<any> {
      const col = getCollection(modelName);
      const id = options.data.id || uuidv4();
      const data = { ...options.data, id };
      
      if (!data.updatedAt) data.updatedAt = new Date().toISOString();
      if (!data.createdAt) data.createdAt = new Date().toISOString();

      await col.doc(id).set(data);
      return data;
    },

    async createMany(options: any): Promise<{ count: number }> {
      const col = getCollection(modelName);
      const batch = firestore.batch();
      let count = 0;
      
      for (const item of options.data) {
        const id = item.id || uuidv4();
        const data = { ...item, id };
        if (!data.updatedAt) data.updatedAt = new Date().toISOString();
        if (!data.createdAt) data.createdAt = new Date().toISOString();
        batch.set(col.doc(id), data);
        count++;
      }
      
      await batch.commit();
      return { count };
    },

    async update(options: any): Promise<any> {
      const doc = await findByCompoundKey(modelName, options.where);
      if (!doc) throw new Error(`Record not found in ${modelName}`);
      
      const processedData = processData(options.data);
      processedData.updatedAt = new Date().toISOString();
      
      await doc.ref.update(processedData);
      
      const updated = await doc.ref.get();
      return { ...updated.data(), id: updated.id };
    },

    async updateMany(options: any): Promise<{ count: number }> {
      const col = getCollection(modelName);
      let query: FirebaseFirestore.Query = col;
      let postFilters: ((item: any) => boolean)[] = [];

      if (options?.where) {
        const result = applyWhereClause(query, options.where);
        query = result.query;
        postFilters = result.postFilters;
      }

      const snapshot = await query.get();
      let docs = snapshot.docs;
      if (postFilters.length > 0) {
        const filtered = applyPostFilters(docs.map(d => ({ ...d.data(), id: d.id })), postFilters);
        const filteredIds = new Set(filtered.map((f: any) => f.id));
        docs = docs.filter(d => filteredIds.has(d.id));
      }

      const batch = firestore.batch();
      const processedData = processData(options.data);
      processedData.updatedAt = new Date().toISOString();

      docs.forEach(doc => {
        batch.update(doc.ref, processedData);
      });

      await batch.commit();
      return { count: docs.length };
    },

    async delete(options: any): Promise<any> {
      const doc = await findByCompoundKey(modelName, options.where);
      if (!doc) throw new Error(`Record not found in ${modelName}`);
      const data = { ...doc.data(), id: doc.id };
      await doc.ref.delete();
      return data;
    },

    async deleteMany(options?: any): Promise<{ count: number }> {
      const col = getCollection(modelName);
      let query: FirebaseFirestore.Query = col;
      let postFilters: ((item: any) => boolean)[] = [];

      if (options?.where) {
        const result = applyWhereClause(query, options.where);
        query = result.query;
        postFilters = result.postFilters;
      }

      const snapshot = await query.get();
      let docs = snapshot.docs;
      if (postFilters.length > 0) {
        const filtered = applyPostFilters(docs.map(d => ({ ...d.data(), id: d.id })), postFilters);
        const filteredIds = new Set(filtered.map((f: any) => f.id));
        docs = docs.filter(d => filteredIds.has(d.id));
      }

      const batch = firestore.batch();
      docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return { count: docs.length };
    },

    async upsert(options: any): Promise<any> {
      const doc = await findByCompoundKey(modelName, options.where);
      if (doc) {
        const processedData = processData(options.update);
        processedData.updatedAt = new Date().toISOString();
        await doc.ref.update(processedData);
        const updated = await doc.ref.get();
        return { ...updated.data(), id: updated.id };
      } else {
        return this.create({ data: { ...options.create } });
      }
    },

    async count(options?: any): Promise<number> {
      const col = getCollection(modelName);
      let query: FirebaseFirestore.Query = col;
      let postFilters: ((item: any) => boolean)[] = [];

      if (options?.where) {
        const result = applyWhereClause(query, options.where);
        query = result.query;
        postFilters = result.postFilters;
      }

      const snapshot = await query.get();
      if (postFilters.length > 0) {
        return applyPostFilters(snapshot.docs.map(d => ({ ...d.data(), id: d.id })), postFilters).length;
      }
      return snapshot.size;
    },
  };
}

// リレーションの解決
async function resolveRelation(parentModel: string, relName: string, parentData: any, relOptions: any): Promise<any> {
  const relationMap: Record<string, Record<string, { collection: string; foreignKey: string; type: 'one' | 'many'; parentKey?: string }>> = {
    staff: {
      org: { collection: 'organizations', foreignKey: 'id', type: 'one', parentKey: 'orgId' },
      leaveBalances: { collection: 'leave_balances', foreignKey: 'staffId', type: 'many' },
      attendances: { collection: 'attendances', foreignKey: 'staffId', type: 'many' },
      leaveRequests: { collection: 'leave_requests', foreignKey: 'staffId', type: 'many' },
      specialBalances: { collection: 'special_leave_balances', foreignKey: 'staffId', type: 'many' },
      leaveOfAbsenceRecords: { collection: 'leave_of_absence_records', foreignKey: 'staffId', type: 'many' },
    },
    leaveRequest: {
      staff: { collection: 'staff', foreignKey: 'id', type: 'one', parentKey: 'staffId' },
      approval: { collection: 'leave_approvals', foreignKey: 'requestId', type: 'one' },
    },
    leaveApproval: {
      request: { collection: 'leave_requests', foreignKey: 'id', type: 'one', parentKey: 'requestId' },
    },
    leaveBalance: {
      staff: { collection: 'staff', foreignKey: 'id', type: 'one', parentKey: 'staffId' },
    },
    attendance: {
      staff: { collection: 'staff', foreignKey: 'id', type: 'one', parentKey: 'staffId' },
    },
    organization: {
      staff: { collection: 'staff', foreignKey: 'orgId', type: 'many' },
      settings: { collection: 'setting_masters', foreignKey: 'orgId', type: 'many' },
    },
  };

  const rel = relationMap[parentModel]?.[relName];
  if (!rel) return relName.endsWith('s') ? [] : null;

  const col = firestore.collection(rel.collection);

  if (rel.type === 'one') {
    if (rel.parentKey) {
      const lookupValue = parentData[rel.parentKey];
      if (!lookupValue) return null;
      
      if (rel.foreignKey === 'id') {
        const doc = await col.doc(lookupValue).get();
        if (!doc.exists) return null;
        let result = { ...doc.data(), id: doc.id };
        if (typeof relOptions === 'object' && relOptions.select) {
          result = applySelect(result, relOptions.select);
        }
        return result;
      } else {
        const snapshot = await col.where(rel.foreignKey, '==', lookupValue).limit(1).get();
        if (snapshot.empty) return null;
        let result = { ...snapshot.docs[0].data(), id: snapshot.docs[0].id };
        if (typeof relOptions === 'object' && relOptions.select) {
          result = applySelect(result, relOptions.select);
        }
        return result;
      }
    }
    return null;
  } else {
    let query: FirebaseFirestore.Query = col.where(rel.foreignKey, '==', parentData.id);
    let postFilters: ((item: any) => boolean)[] = [];
    
    if (typeof relOptions === 'object') {
      // インデックスエラー回避のため orderBy はインメモリで行う
      if (relOptions.where) {
        const wr = applyWhereClause(query, relOptions.where);
        query = wr.query;
        postFilters = wr.postFilters;
      }
    }

    const snapshot = await query.get();
    let results = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    
    // post-filter
    results = applyPostFilters(results, postFilters);

    // インメモリ orderBy
    if (typeof relOptions === 'object' && relOptions.orderBy) {
      results = applyInMemoryOrderBy(results, relOptions.orderBy);
    }

    // インメモリ take (limit)
    if (typeof relOptions === 'object' && relOptions.take) {
      results = results.slice(0, relOptions.take);
    }
    
    if (typeof relOptions === 'object' && relOptions.select) {
      results = results.map((r: any) => applySelect(r, relOptions.select));
    }
    
    return results;
  }
}

// Prisma互換トランザクション
async function $transaction(callback: (tx: typeof prisma) => Promise<any>): Promise<any> {
  return await callback(prisma);
}

// Prisma互換のメインオブジェクト
export const prisma = {
  organization: createModelProxy('organization'),
  staff: createModelProxy('staff'),
  attendance: createModelProxy('attendance'),
  leaveRequest: createModelProxy('leaveRequest'),
  leaveApproval: createModelProxy('leaveApproval'),
  leaveBalance: createModelProxy('leaveBalance'),
  dutyMaster: createModelProxy('dutyMaster'),
  settingMaster: createModelProxy('settingMaster'),
  specialLeaveMaster: createModelProxy('specialLeaveMaster'),
  specialLeaveBalance: createModelProxy('specialLeaveBalance'),
  schedule: createModelProxy('schedule'),
  leaveOfAbsenceRecord: createModelProxy('leaveOfAbsenceRecord'),
  $transaction,
};
