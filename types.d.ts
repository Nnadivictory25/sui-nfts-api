type attribute = {
    key: string;
    value: string;
}

type indexData = {
    to_index: string[];
    currently_indexing: string;
    last_cursor: string | null;
}

type RarityScore = {
    id: string;
    score: number;
}