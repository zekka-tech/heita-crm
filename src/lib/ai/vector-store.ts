export function getVectorStoreConfig() {
  return {
    tableName: "DocumentChunk",
    vectorColumnName: "embedding",
    dimensions: 1024
  };
}

