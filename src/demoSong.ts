/** CC BY 3.0; full attribution is shipped in demo-song-license.txt. */
export async function loadDemoSong(): Promise<File> {
  const response = await fetch(`${import.meta.env.BASE_URL}demo-song.mp3`);
  if (!response.ok) throw new Error('Demo unavailable. Please try again or load your own track.');
  return new File([await response.blob()], "Karissa Hobbs - Let's Go Fishin' (demo).mp3", { type:'audio/mpeg', lastModified:0 });
}
