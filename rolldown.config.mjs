import { defineConfig } from 'rolldown'

export default defineConfig({
    input: 'src/main.js',
    platform: 'node',
    output: {
        dir: 'bundle',
    },
})
