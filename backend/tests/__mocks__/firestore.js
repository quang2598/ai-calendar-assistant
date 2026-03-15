/**
 * In-memory Firestore mock for testing.
 * Implements the chainable query API used by ConversationHistory model.
 */

let store = {};
let idCounter = 0;

class MockDocSnapshot {
  constructor(id, data) {
    this._id = id;
    this._data = data;
  }

  get exists() {
    return this._data !== undefined;
  }

  get id() {
    return this._id;
  }

  data() {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }
}

class MockDocRef {
  constructor(collection, id) {
    this._collection = collection;
    this._id = id;
  }

  async get() {
    const data = store[this._collection] && store[this._collection][this._id];
    return new MockDocSnapshot(this._id, data);
  }

  async set(data) {
    if (!store[this._collection]) store[this._collection] = {};
    store[this._collection][this._id] = JSON.parse(JSON.stringify(data));
  }

  async update(data) {
    if (!store[this._collection] || !store[this._collection][this._id]) {
      throw new Error('Document not found');
    }
    const existing = store[this._collection][this._id];
    for (const [key, value] of Object.entries(data)) {
      if (value && value._type === 'arrayUnion') {
        existing[key] = [...(existing[key] || []), ...value._elements];
      } else {
        existing[key] = value;
      }
    }
  }

  async delete() {
    if (store[this._collection]) {
      delete store[this._collection][this._id];
    }
  }
}

class MockQuery {
  constructor(collection) {
    this._collection = collection;
    this._filters = [];
    this._orderByField = null;
    this._orderByDir = 'asc';
    this._offsetVal = 0;
    this._limitVal = Infinity;
  }

  where(field, op, value) {
    const q = this._clone();
    q._filters.push({ field, op, value });
    return q;
  }

  orderBy(field, dir = 'asc') {
    const q = this._clone();
    q._orderByField = field;
    q._orderByDir = dir;
    return q;
  }

  offset(n) {
    const q = this._clone();
    q._offsetVal = n;
    return q;
  }

  limit(n) {
    const q = this._clone();
    q._limitVal = n;
    return q;
  }

  count() {
    return {
      get: async () => {
        const docs = this._getFilteredDocs();
        return { data: () => ({ count: docs.length }) };
      },
    };
  }

  async get() {
    let docs = this._getFilteredDocs();

    if (this._orderByField) {
      docs.sort((a, b) => {
        const aVal = a.data[this._orderByField];
        const bVal = b.data[this._orderByField];
        if (aVal < bVal) return this._orderByDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return this._orderByDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    docs = docs.slice(this._offsetVal, this._offsetVal + this._limitVal);

    return {
      docs: docs.map((d) => new MockDocSnapshot(d.id, d.data)),
    };
  }

  _getFilteredDocs() {
    const collection = store[this._collection] || {};
    let docs = Object.entries(collection).map(([id, data]) => ({ id, data }));

    for (const filter of this._filters) {
      docs = docs.filter((d) => {
        const val = d.data[filter.field];
        switch (filter.op) {
          case '==':
            return val === filter.value;
          case '!=':
            return val !== filter.value;
          case '>':
            return val > filter.value;
          case '>=':
            return val >= filter.value;
          case '<':
            return val < filter.value;
          case '<=':
            return val <= filter.value;
          default:
            return true;
        }
      });
    }

    return docs;
  }

  _clone() {
    const q = new MockQuery(this._collection);
    q._filters = [...this._filters];
    q._orderByField = this._orderByField;
    q._orderByDir = this._orderByDir;
    q._offsetVal = this._offsetVal;
    q._limitVal = this._limitVal;
    return q;
  }
}

class MockCollectionRef extends MockQuery {
  constructor(name) {
    super(name);
    this._name = name;
  }

  doc(id) {
    return new MockDocRef(this._name, id);
  }

  async add(data) {
    idCounter++;
    const id = `mock-id-${idCounter}`;
    if (!store[this._name]) store[this._name] = {};
    store[this._name][id] = JSON.parse(JSON.stringify(data));
    return { id };
  }
}

const mockDb = {
  collection: (name) => new MockCollectionRef(name),
  listCollections: async () => Object.keys(store).map((id) => ({ id })),
};

const MockFieldValue = {
  arrayUnion: (...elements) => ({ _type: 'arrayUnion', _elements: elements }),
};

const clearStore = () => {
  store = {};
  idCounter = 0;
};

module.exports = { mockDb, MockFieldValue, clearStore };
