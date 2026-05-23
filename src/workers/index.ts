export async function startWorkers() {
  return {
    status: "placeholder"
  };
}

if (import.meta.main) {
  startWorkers().then((result) => {
    console.log("Heita workers:", result.status);
  });
}

