from typing import Literal

from pydantic import BaseModel, ConfigDict


class Triple(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event: str
    rel: Literal["agent", "patient", "location", "next"]
    arg: str
    arg_type: Literal["Character", "Object", "Location", "Event"]


class Graph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    triples: list[Triple]
