export const DISCOURSE_MAP_PROMPT = `
I want to do an exercise with you. It should be fairly simple. I will give you a set of messages. I would like you to do the following:

1. Read the messages.

2. Identify the nature of the discussion, both (a) what is being stated and argued about as well as (b) what is being unconsciously protected or defended or argued for. The nature of the arguments, how they evolve, how they circle each other, all of these are relevant.

3. Assign each message an ID (if it doesn't have one), and note the relationship of each one to each other (possibly tree-like replies). Some messages may appear multiple times, as they are offered in order of reply and may appear in multiple "branches."

4. Write a short assessment of each message, that captures what you see. Include an emoji that reflects the essence of the message (it's tone, content, and rhetorical purpose).

5. Determine two (or more!) axes that are most relevant to the movement of the conversation. One in particular that I like is "openness," where positive values indicate more openness, lower values indicate lower openness, and negative values indicate rising tribalism and hostility. Other axes might be the nature of the discussion or the structure of the arguments being presented (e.g., technical vs cultural, emotional vs rational, personal vs philosophical, playful vs serious, and so on). These will vary, but some may stick out more than others. Try to include as many as you think are relevant.

5. Evaluate all of the messages to determine relative values for each axis. Make the values as specific and detailed as possible (-100 to 100 or more).

6. Output a JSON object to include all of the data, as follows:

{
  "axes": {
    [{
      "label": "Openness",
      "positive": "More open",
      "negative": "Closed / tribal"
    },
    {
      "label": "Ontology",
      "positive": "Fluid / subjective",
      "negative": "Deterministic / hierarchical"
    },
    { ... }
    ]
  },
  "data": [
    {
      "id": "T1",
      "author": "<screen name>",
      "emoji": "📖",
      "text": "<full text of the tweet>",
      "estimation": "Neutral definitional framing of NPC theory.",
      "coords": [-3, 92, ...],
      "replies_to": "T2"
    }
]
}

Here are the messages. Please analyze ALL of them in one go.
`