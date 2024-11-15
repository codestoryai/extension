import { EditorProvider } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'

const extensions = [Document, Paragraph, Text]
const content = '<p>Hello World!</p>'

const Tiptap = () => {
    return (
        <EditorProvider extensions={extensions} content={content}>
        </EditorProvider>
    )
}

export default Tiptap
