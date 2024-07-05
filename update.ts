import { encodeHex } from "https://deno.land/std@0.202.0/encoding/hex.ts";
import ollama from 'ollama';

const local_models_raw = await ollama.list();
/**
 * Maps the models from the local_models_raw array to a new array with only the "name" and "digest" properties.
 *
 * @param {Array} local_models_raw - The array of models to be mapped.
 * @returns {Array} - The new array with only the "name" and "digest" properties.
 */
const localModels = local_models_raw.models.map((model) => ({ "name": model.name, "digest": model.digest }));

for await (const model of localModels) {
  const localdigest = model.digest
  let [repo, tag] = model.name.split(":")
  if (!repo.includes("/")) {
    repo = `library/${repo}`
  }
  
  const remoteModelInfo = await fetch(`https://ollama.ai/v2/${repo}/manifests/${tag}`, {
    headers: {
      "Accept": "application/vnd.docker.distribution.manifest.v2+json"
    }
  })

  if (remoteModelInfo.status == 200) {
    const remoteModelInfoJSON = await remoteModelInfo.json()

    const hash = await jsonhash(remoteModelInfoJSON);
    if (hash === localdigest) {
      console.log(`You have the latest ${model.name}`)
    } else {
      console.log(`You have an outdated version of ${model.name}`)
      console.log(`Updating ${model.name}`)
      const pullResponse = await ollama.pull({ model: model.name, stream: true }); 

      /**
       * Encodes a string using the TextEncoder class.
       *
       * @param s - The string to be encoded.
       * @returns The encoded string as a Uint8Array.
       */
      const enc = (s: string) => new TextEncoder().encode(s);

      let linelength = 0; // Declare and initialize linelength variable

      for await (const part of pullResponse) {
        if (part.digest) {
          let percent = 0;
          if (part.completed && part.total) {
            percent = Math.round((part.completed / part.total) * 100);
          }
          const clear = ` `.repeat(linelength);
          Deno.stdout.write(enc(`\r${clear}\r${part.status} ${percent}%...`));
          linelength = `${part.status} ${percent}%...`.length;
          
        } else {
          
          Deno.stdout.write(enc(`\r${' '.repeat(linelength)}\r${part.status}\n`));
        }
      }
    }
  }
}

/**
 * Calculates the SHA-256 hash of a JSON string.
 * @param json - The JSON string to hash.
 * @returns The SHA-256 hash of the JSON string.
 */
async function jsonhash(json: string) {
  // Remove whitespace from the JSON string
  const jsonstring = JSON.stringify(json).replace(/\s+/g, '');

  // Encode the JSON string as a Uint8Array
  const messageBuffer = new TextEncoder().encode(jsonstring);

  // Calculate the SHA-256 hash of the message buffer
  const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);

  // Convert the hash buffer to a hexadecimal string
  const hash = encodeHex(hashBuffer);

  return hash;
}
