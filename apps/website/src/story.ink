VAR courage = 0
VAR path = "undecided"

The light is still on. After all these years, someone is waiting. # speaker:scout # scene:valley # animation:scout:idle
Beyond the valley, a solitary tower keeps watch over a sleeping world. Its beacon has been dark for a hundred winters. Tonight, it burns again. # speaker:narrator
I could follow the old road. Or take the path that nobody remembers. # speaker:scout

* [Follow the light to the tower.]
    ~ courage = courage + 1
    ~ path = "the tower"
    -> tower
* [Explore the forgotten path.]
    ~ path = "the forest"
    -> forest

=== tower ===
One step. Then another. The valley falls away behind you. # speaker:narrator # animation:scout:walk
You came. I was beginning to think the world had forgotten how to look up. # speaker:keeper # scene:tower # animation:scout:idle
Who are you? And why did you light the beacon? # speaker:scout
Someone has to keep the stories alive. I thought it might be your turn. # speaker:keeper
* [I am ready.]
    ~ courage = courage + 2
    -> ending
* [Tell me one more story first.]
    The keeper smiles. Above you, the stars seem to lean a little closer. # speaker:narrator
    -> ending

=== forest ===
Under the trees, the air is full of quiet things: the rustle of leaves, the ticking of beetles, and a song you almost remember. You walk until the path becomes a thread, and the thread becomes a memory. Then, just when you are certain you have lost your way, you notice the small amber lights between the branches. They are moving toward the tower. They have been waiting for you, too. # speaker:narrator # animation:scout:walk
All roads lead to a story, I suppose. # speaker:scout # animation:scout:idle
-> tower

=== ending ===
The first light of morning touches the valley. A new story is about to begin. # speaker:narrator # hide:keeper
You chose {path}. Your courage is {courage}. And this is only the beginning. # speaker:scout
-> END
